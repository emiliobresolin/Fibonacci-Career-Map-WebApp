import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generators, Issuer, type Client, type TokenSet } from 'openid-client';

import type { Env } from '../common/env.config.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type OidcAuthRequest = {
  /** URL the browser must visit to start the IdP login. */
  authorizationUrl: string;
  /** Opaque state token. The web side stashes this in sessionStorage so the
   *  callback page can echo it back; the api uses it to retrieve the PKCE
   *  verifier + nonce + organizationId from the server-side state store. */
  state: string;
  /** PKCE verifier + nonce — internal to the api. Returned here only because
   *  the controller is the one that drops them into the state store. */
  codeVerifier: string;
  nonce: string;
};

export type OidcCallbackResult = {
  organizationId: string;
  email: string;
  displayName: string;
  /** Raw IdP `sub` claim — stable identity anchor that the cross-org-identity
   *  story will surface as User.externalId (see deferred-work F6 from 2-1). */
  externalSub: string;
};

type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
};

/** Outbound HTTP timeout for IdP discovery + token exchange. 10s is generous
 *  for healthy IdPs; anything slower is a real outage and shouldn't pin a
 *  NestJS request handler waiting on it. */
const OIDC_HTTP_TIMEOUT_MS = 10_000;

/**
 * Per-organization OIDC client cache. Discovery + dynamic client construction
 * are expensive (HTTPS round-trip to `<issuer>/.well-known/openid-configuration`
 * + JWKS fetch); we cache the constructed `Client` so repeat callbacks for the
 * same org skip both. Cache eviction is process-restart only — short of an
 * IdP key rotation, the cached client stays valid for the pod's lifetime.
 *
 * Architecture §10.1 + PRD FR-1.1 — discovery document loaded from per-org
 * `oidc_config` JSONB on the Organization row (Story 2-1).
 */
@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private readonly clientCache = new Map<string, Promise<Client>>();

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * Build the IdP authorization URL for an org. Caller is the controller,
   * which is responsible for stashing { codeVerifier, nonce, state } in the
   * server-side OidcStateStore — the web only sees { authorizationUrl, state }.
   */
  async startAuth(organizationId: string): Promise<OidcAuthRequest> {
    const client = await this.getClient(organizationId);

    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const nonce = generators.nonce();
    const state = generators.state();

    const authorizationUrl = client.authorizationUrl({
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      nonce,
      state,
    });

    return { authorizationUrl, state, codeVerifier, nonce };
  }

  /**
   * Exchange an IdP authorization code for tokens, then derive the FCM user
   * identity (email + displayName + externalSub). PKCE verifier + nonce are
   * the server-stored values from the state store, NOT user-replayed; that
   * is what makes state real CSRF + replay protection.
   */
  async exchangeCallback(
    organizationId: string,
    params: { code: string; state: string; codeVerifier: string; nonce: string },
  ): Promise<OidcCallbackResult> {
    const client = await this.getClient(organizationId);
    const redirectUri = this.requireRedirectUri();

    let tokenSet: TokenSet;
    try {
      tokenSet = await withTimeout(
        client.callback(
          redirectUri,
          { code: params.code, state: params.state },
          { code_verifier: params.codeVerifier, nonce: params.nonce, state: params.state },
        ),
        OIDC_HTTP_TIMEOUT_MS,
        'IdP token endpoint',
      );
    } catch (err) {
      // Never log the full error: openid-client errors often serialize the
      // authorization code or partial id_token, which Sentry/Loki would then
      // index. Log only the structural fields.
      this.logger.warn(
        `OIDC token exchange failed (org=${organizationId} code=${getErrorCode(err)})`,
      );
      throw new UnauthorizedException('OIDC token exchange failed');
    }

    let email: string | null;
    let displayName: string | null;
    let sub: string | undefined;
    try {
      const claims = tokenSet.claims();
      email = typeof claims.email === 'string' ? claims.email : null;
      const candidateName =
        typeof claims.name === 'string'
          ? claims.name
          : typeof claims.preferred_username === 'string'
            ? claims.preferred_username
            : null;
      displayName = candidateName ?? email;
      sub = typeof claims.sub === 'string' ? claims.sub : undefined;
    } catch (err) {
      this.logger.warn(`OIDC id_token claims parse failed (code=${getErrorCode(err)})`);
      throw new UnauthorizedException('OIDC id_token is malformed');
    }

    if (!email || !displayName || !sub) {
      throw new UnauthorizedException('OIDC id_token missing required claims (email/name/sub)');
    }

    return {
      organizationId,
      email,
      displayName,
      externalSub: sub,
    };
  }

  /** Used by unit tests + the AuthController boot-time validation. */
  requireRedirectUri(): string {
    const uri = this.config.get('OIDC_REDIRECT_URI');
    if (!uri) {
      // Operator configuration error — surface as 5xx, not 401, so the
      // browser doesn't think the user typed the wrong password.
      throw new InternalServerErrorException(
        'OIDC_REDIRECT_URI is not configured for this environment',
      );
    }
    return uri;
  }

  private async getClient(organizationId: string): Promise<Client> {
    let pending = this.clientCache.get(organizationId);
    if (!pending) {
      pending = this.buildClient(organizationId);
      this.clientCache.set(organizationId, pending);
      // Evict the cached promise if discovery fails so the next caller can
      // retry. Swallow the rejection here — the original awaiter still gets
      // it via the awaited `pending` they hold. Rethrowing from inside this
      // .catch() handler produces an UnhandledPromiseRejection.
      pending.catch(() => {
        this.clientCache.delete(organizationId);
      });
    }
    return pending;
  }

  private async buildClient(organizationId: string): Promise<Client> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, oidcConfig: true },
    });
    if (!org) {
      throw new NotFoundException(`Organization ${organizationId} not found`);
    }

    const cfg = this.parseConfig(org.oidcConfig);
    const issuer = await withTimeout(
      Issuer.discover(cfg.issuer),
      OIDC_HTTP_TIMEOUT_MS,
      'IdP discovery endpoint',
    );
    return new issuer.Client({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uris: [this.requireRedirectUri()],
      response_types: ['code'],
    });
  }

  private parseConfig(raw: unknown): OidcConfig {
    if (
      typeof raw !== 'object' ||
      raw === null ||
      typeof (raw as Record<string, unknown>)['issuer'] !== 'string' ||
      typeof (raw as Record<string, unknown>)['clientId'] !== 'string' ||
      typeof (raw as Record<string, unknown>)['clientSecret'] !== 'string'
    ) {
      throw new InternalServerErrorException(
        'organization.oidc_config must be { issuer, clientId, clientSecret }',
      );
    }
    const cfg = raw as OidcConfig;
    // SSRF anchor: organization.oidc_config.issuer is admin-controllable JSONB.
    // Refuse anything that isn't a public HTTPS URL pointing to a non-private
    // host. The api allows http:// only in non-production (local IdP testing).
    this.assertSafeIssuerUrl(cfg.issuer);
    return cfg;
  }

  private assertSafeIssuerUrl(rawIssuer: string): void {
    let parsed: URL;
    try {
      parsed = new URL(rawIssuer);
    } catch {
      throw new InternalServerErrorException('organization.oidc_config.issuer must be a valid URL');
    }
    const allowedProtocols =
      this.config.get('NODE_ENV') === 'production' ? ['https:'] : ['https:', 'http:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      throw new InternalServerErrorException(
        `organization.oidc_config.issuer must use ${allowedProtocols.join(' or ')}`,
      );
    }
    if (isPrivateHost(parsed.hostname)) {
      throw new InternalServerErrorException(
        'organization.oidc_config.issuer must not point at a private/loopback/link-local host',
      );
    }
  }
}

/** Wrap a promise in a hard timeout so a stuck IdP cannot pin a request. */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timed out talking to ${label} after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/** Best-effort structural error tag for logs. Never `String(err)` — that
 *  serializes message bodies which often contain the authorization code or
 *  partial id_token bytes. */
function getErrorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: unknown; name?: unknown };
    if (typeof e.code === 'string') return e.code;
    if (typeof e.name === 'string') return e.name;
  }
  return 'unknown';
}

/** Refuse RFC1918 / loopback / link-local / .local hosts on the IdP side.
 *  This is the SSRF anchor — an org admin who can set `oidc_config.issuer`
 *  cannot pivot through `Issuer.discover()` to internal metadata endpoints
 *  (169.254.169.254, etc) or cluster-local services. */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  // IPv4 literal checks
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4.map((x) => Number(x));
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local incl. AWS metadata
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 0) return true;
  }
  // IPv6 literal checks (basic — full normalization is out of scope).
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) return true;
  return false;
}
