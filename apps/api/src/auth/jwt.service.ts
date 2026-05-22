import { randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger, UnauthorizedException, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';

import type { Env } from '../common/env.config.js';
import { ROLES, type Role } from './auth.types.js';

/**
 * Access-token payload. Carries the minimum needed for the Layer-1 AuthGuard
 * (Story E2.4) to populate `request.user` without re-querying the DB on every
 * request. user_id + organization_id + role are required; arbitrary extra
 * claims are not part of the contract.
 */
export type AccessTokenPayload = {
  sub: string; // user.id
  org: string; // organization.id
  role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
  /** OIDC standard `name` claim. Carried into the JWT so the ActorContext
   *  primitive (Story 2-5) can attribute actions without a DB round-trip
   *  on every request. Kept optional during the migration: tokens minted
   *  before Story 2-5 don't have it, and the auth guard tolerates an
   *  empty string. New tokens always populate. */
  name?: string;
  /** Session anchor (Story 2-3). The Redis session store keys on
   *  `session:<org>:<sub>:<jti>`; the auth guard checks Redis on
   *  every request and rejects when the key is gone (forced logout).
   *  Optional in the type so dev/test paths without a session store
   *  can still mint tokens. */
  jti?: string;
};

export type RefreshTokenPayload = {
  sub: string; // user.id
  org: string; // organization.id
  /** Token-rotation jti so a single refresh can be revoked when Redis-backed
   *  session store (Story E2.3) is wired. Unused today (no revocation list). */
  jti?: string;
};

/**
 * JWT signing + verification using `jose`. Symmetric HS256 for the scaffold —
 * the JWT never leaves the FCM trust boundary so a single shared secret is
 * acceptable. Asymmetric RS256 + JWKS lands when external services (SCIM,
 * downstream webhooks) need to verify tokens — tracked in deferred-work.
 */
@Injectable()
export class JwtService implements OnModuleInit {
  private readonly logger = new Logger(JwtService.name);
  private key!: Uint8Array;
  private accessTtl!: number;
  private refreshTtl!: number;
  private static readonly ALG = 'HS256' as const;
  private static readonly ISSUER = 'fcm-api';
  private static readonly AUDIENCE = 'fcm';

  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const secret = this.config.get('JWT_SIGNING_SECRET');
    if (secret && secret.length >= 32) {
      this.key = new TextEncoder().encode(secret);
    } else {
      // Production env-validation forbids this path (JWT_SIGNING_SECRET is
      // required when NODE_ENV=production). In dev/test, instead of falling
      // back to a hardcoded string (which would be a well-known constant in
      // an OSS repo) we mint an ephemeral random key per process so tokens
      // signed by this pod cannot be forged by anyone who reads the source.
      // The trade-off: tokens are invalidated on every restart, which is
      // acceptable in dev/test.
      this.key = randomBytes(32);
      this.logger.warn(
        'JWT_SIGNING_SECRET not configured — using an ephemeral process-local key. Tokens will be invalidated on restart. This path is forbidden in production by env-validation.',
      );
    }
    this.accessTtl = this.config.get('JWT_ACCESS_TTL_SECONDS');
    this.refreshTtl = this.config.get('JWT_REFRESH_TTL_SECONDS');
  }

  async signAccess(payload: AccessTokenPayload): Promise<string> {
    const builder = new SignJWT({
      org: payload.org,
      role: payload.role,
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.jti !== undefined ? { jti: payload.jti } : {}),
    })
      .setProtectedHeader({ alg: JwtService.ALG })
      .setSubject(payload.sub)
      .setIssuer(JwtService.ISSUER)
      .setAudience(JwtService.AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtl}s`);
    if (payload.jti !== undefined) builder.setJti(payload.jti);
    return builder.sign(this.key);
  }

  async signRefresh(payload: RefreshTokenPayload): Promise<string> {
    return new SignJWT({ org: payload.org, ...(payload.jti !== undefined ? { jti: payload.jti } : {}) })
      .setProtectedHeader({ alg: JwtService.ALG })
      .setSubject(payload.sub)
      .setIssuer(JwtService.ISSUER)
      .setAudience(`${JwtService.AUDIENCE}-refresh`)
      .setIssuedAt()
      .setExpirationTime(`${this.refreshTtl}s`)
      .sign(this.key);
  }

  async verifyAccess(token: string): Promise<AccessTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: JwtService.ISSUER,
        audience: JwtService.AUDIENCE,
      });
      if (
        typeof payload.sub !== 'string' ||
        typeof payload['org'] !== 'string' ||
        typeof payload['role'] !== 'string'
      ) {
        throw new UnauthorizedException('Malformed access token');
      }
      // Validate role against the declared enum so a token carrying a
      // stale / forged / mis-cased role string (e.g. 'SUPERUSER') is
      // rejected here rather than silently stamped onto req.user and
      // potentially passing an authenticated-only route's check.
      const role = payload['role'];
      if (!(ROLES as readonly string[]).includes(role)) {
        throw new UnauthorizedException('Malformed access token');
      }
      // Sanitize the `name` claim — bound length and strip ASCII control
      // characters so a malicious or compromised IdP cannot inject a
      // multi-MB string or NUL bytes that would propagate verbatim into
      // audit rows / UI rendering. Anything that doesn't fit becomes
      // an empty string (the AuthGuard already tolerates that for legacy
      // tokens).
      const rawName = payload['name'];
      const name = typeof rawName === 'string' ? sanitizeName(rawName) : undefined;
      return {
        sub: payload.sub,
        org: payload['org'],
        role: role as Role,
        ...(name !== undefined ? { name } : {}),
        ...(typeof payload.jti === 'string' ? { jti: payload.jti } : {}),
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  async verifyRefresh(token: string): Promise<RefreshTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: JwtService.ISSUER,
        audience: `${JwtService.AUDIENCE}-refresh`,
      });
      if (typeof payload.sub !== 'string' || typeof payload['org'] !== 'string') {
        throw new UnauthorizedException('Malformed refresh token');
      }
      return {
        sub: payload.sub,
        org: payload['org'],
        ...(typeof payload.jti === 'string' ? { jti: payload.jti } : {}),
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}

/**
 * Sanitize the OIDC `name` claim before it lands on `req.user.display_name`.
 * Strips ASCII control characters (0x00–0x1F and 0x7F) and caps length at
 * NAME_MAX_CHARS. Defends against a compromised IdP shipping a megabyte-long
 * display name or smuggling NUL bytes through to audit rows / UI rendering.
 * Returns `''` when nothing usable remains so the AuthGuard's empty-string
 * fallback handles it.
 */
const NAME_MAX_CHARS = 256;
function sanitizeName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (stripped.length === 0) return '';
  return stripped.length > NAME_MAX_CHARS ? stripped.slice(0, NAME_MAX_CHARS) : stripped;
}
