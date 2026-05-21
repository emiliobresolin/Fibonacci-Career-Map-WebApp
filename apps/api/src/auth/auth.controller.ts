import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import type { Env } from '../common/env.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from './jwt.service.js';
import { OidcStateStore } from './oidc-state.store.js';
import { OidcService } from './oidc.service.js';

/** Request body for POST /auth/oidc/init. */
type InitDto = {
  organizationSlug: string;
};

/** Request body for POST /auth/oidc/callback. The web only echoes the IdP-issued
 *  `code` + `state`; the api looks the PKCE verifier + nonce up server-side
 *  via the state. That is what gives state real CSRF protection — replaying
 *  the same client-supplied verifier would defeat the purpose. */
type CallbackDto = {
  code: string;
  state: string;
};

/** Request body for POST /auth/refresh. NextAuth posts the current refresh
 *  token from its server-side session; never callable from the browser
 *  directly because the refresh token never lives in a browser-readable cookie. */
type RefreshDto = {
  refreshToken: string;
};

/** PRD §4.2 precedence: ADMIN > MANAGER > EMPLOYEE. Postgres native enums
 *  sort by declared ordinal, so the Prisma `orderBy: { role: 'desc' }` shape
 *  WOULD work — but only as long as the schema enum declaration order
 *  happens to match the precedence we want. Computing the maximum
 *  explicitly is self-documenting and survives any future enum reordering. */
const ROLE_PRECEDENCE = { ADMIN: 3, MANAGER: 2, EMPLOYEE: 1 } as const;
type RoleKey = keyof typeof ROLE_PRECEDENCE;

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(OidcService) private readonly oidc: OidcService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(OidcStateStore) private readonly stateStore: OidcStateStore,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Step 1 of the OIDC dance. Web caller passes the org slug; api looks up
   * the org, builds the IdP auth URL with PKCE + nonce + state, stashes the
   * verifier+nonce in the server-side state store, and returns only the
   * authorization URL + state token to the web side.
   */
  @Post('oidc/init')
  async init(@Body() dto: InitDto): Promise<{ authorizationUrl: string; state: string }> {
    if (!dto?.organizationSlug || typeof dto.organizationSlug !== 'string') {
      throw new BadRequestException('organizationSlug is required');
    }
    const slug = dto.organizationSlug.trim();
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
    if (!org) {
      // Don't leak whether the org exists; future story will surface a
      // uniform "if your org is configured, you will be redirected" UX.
      throw new BadRequestException('Unknown organization');
    }
    const req = await this.oidc.startAuth(org.id);
    this.stateStore.save(req.state, {
      codeVerifier: req.codeVerifier,
      nonce: req.nonce,
      organizationId: org.id,
      organizationSlug: org.slug,
    });
    return { authorizationUrl: req.authorizationUrl, state: req.state };
  }

  /**
   * Step 2: exchange the IdP code for tokens, upsert the FCM user row, and
   * return a fresh access/refresh JWT pair. The NextAuth route stores both
   * in its server-side session; the browser only ever sees the NextAuth
   * session cookie, not the JWTs themselves.
   */
  @Post('oidc/callback')
  async callback(@Body() dto: CallbackDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; displayName: string; organizationId: string };
    role: RoleKey;
  }> {
    if (!dto?.code || !dto.state || typeof dto.code !== 'string' || typeof dto.state !== 'string') {
      throw new BadRequestException('code and state are required');
    }
    // Defense-in-depth against the dev-shortcut flow leaking into a prod
    // build: the web shortcut posts code='dev-stub', state='dev-stub'. Refuse
    // these literals outright when NODE_ENV=production, regardless of how
    // the web bundle was built.
    if (this.config.get('NODE_ENV') === 'production' && (dto.code === 'dev-stub' || dto.state === 'dev-stub')) {
      this.logger.warn('Rejecting dev-stub OIDC callback in production');
      throw new UnauthorizedException('Invalid OIDC callback');
    }

    const stateEntry = this.stateStore.consume(dto.state);
    if (!stateEntry) {
      // Either: state was never minted, was already consumed, or expired.
      // All three indicate either a replay attempt or a stale tab. Same
      // 401, same opaque message — no oracle for which case it was.
      throw new UnauthorizedException('Invalid or expired OIDC state');
    }

    const result = await this.oidc.exchangeCallback(stateEntry.organizationId, {
      code: dto.code,
      state: dto.state,
      codeVerifier: stateEntry.codeVerifier,
      nonce: stateEntry.nonce,
    });

    // Upsert the user row keyed on (organizationId, email). Concurrent first
    // logins for the same identity can race the unique index → P2002. Catch
    // it and look up the survivor; the data is idempotent so a re-read is
    // safe. The cross-org-identity story (deferred-work F6 from 2-1) will
    // pivot to externalSub when it lands.
    let user;
    try {
      user = await this.prisma.user.upsert({
        where: {
          organizationId_email: {
            organizationId: result.organizationId,
            email: result.email,
          },
        },
        update: { displayName: result.displayName },
        create: {
          organizationId: result.organizationId,
          email: result.email,
          displayName: result.displayName,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.user.findUnique({
          where: {
            organizationId_email: {
              organizationId: result.organizationId,
              email: result.email,
            },
          },
        });
        if (!existing) throw err;
        user = existing;
      } else {
        throw err;
      }
    }

    const role = await this.resolveHighestRole(user.id, user.organizationId);
    if (!role) {
      this.logger.warn(`User ${user.id} authenticated via OIDC but has no active role_assignment`);
      throw new UnauthorizedException('User is not provisioned for any role in this organization');
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAccess({ sub: user.id, org: user.organizationId, role }),
      this.jwt.signRefresh({ sub: user.id, org: user.organizationId }),
    ]);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        organizationId: user.organizationId,
      },
      role,
    };
  }

  /**
   * Step 3: NextAuth's server-side session posts the refresh token here when
   * the access token is near expiry. We verify the refresh, re-look up the
   * user's current role (in case it changed since login), and issue a new
   * pair.
   *
   * Refresh-token rotation (single-use, revocation-on-use via jti tracking)
   * lands with Story 2-3 (Redis session store). Until then the same refresh
   * can be replayed until its TTL expires — documented operational risk.
   */
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto): Promise<{ accessToken: string; refreshToken: string }> {
    if (!dto?.refreshToken || typeof dto.refreshToken !== 'string') {
      throw new BadRequestException('refreshToken is required');
    }
    const payload = await this.jwt.verifyRefresh(dto.refreshToken);

    // Belt-and-braces: confirm the user still belongs to the org claimed by
    // the refresh token. The JWT signature already binds (sub, org), but a
    // compromised signing key (or a future RS256 misconfiguration) would
    // permit a forged token; a DB cross-check refuses cross-org pivots.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, organizationId: true },
    });
    if (!user || user.organizationId !== payload.org) {
      throw new UnauthorizedException('Refresh token does not match a known user/org pair');
    }

    const role = await this.resolveHighestRole(payload.sub, payload.org);
    if (!role) {
      throw new UnauthorizedException('User has no active role; cannot refresh');
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAccess({ sub: payload.sub, org: payload.org, role }),
      this.jwt.signRefresh({ sub: payload.sub, org: payload.org }),
    ]);
    return { accessToken, refreshToken };
  }

  /** Pick the highest-precedence active role for (user, org). Computed in
   *  JS so we don't depend on Postgres native-enum ordinal ordering matching
   *  our PRD precedence — the Prisma schema's declared enum order does match
   *  today, but encoding the precedence here makes that an explicit invariant
   *  rather than a coincidence. */
  private async resolveHighestRole(userId: string, organizationId: string): Promise<RoleKey | null> {
    const rows = await this.prisma.roleAssignment.findMany({
      where: { userId, organizationId, deactivatedAt: null },
      select: { role: true },
    });
    if (rows.length === 0) return null;
    let best: RoleKey = rows[0]!.role as RoleKey;
    let bestRank = ROLE_PRECEDENCE[best];
    for (const r of rows) {
      const rank = ROLE_PRECEDENCE[r.role as RoleKey];
      if (rank > bestRank) {
        best = r.role as RoleKey;
        bestRank = rank;
      }
    }
    return best;
  }
}
