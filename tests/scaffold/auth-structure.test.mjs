// Scaffold guardrail: verifies the OIDC + JWT (API) + NextAuth (web) surface for Story 2-2.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const api = resolve(root, 'apps/api');
const apiSrc = resolve(api, 'src');
const web = resolve(root, 'apps/web');
const webSrc = resolve(web, 'src');

// ---------- API deps ----------

test('apps/api declares openid-client and jose', () => {
  const pkg = JSON.parse(readFileSync(resolve(api, 'package.json'), 'utf8'));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  assert.ok(deps['openid-client'], 'openid-client must be installed (AC1)');
  assert.ok(deps.jose, 'jose must be installed for JWT signing (AC4)');
});

// ---------- env additions ----------

test('env.config.ts validates OIDC redirect URI + JWT signing config', () => {
  const env = readFileSync(resolve(apiSrc, 'common/env.config.ts'), 'utf8');
  assert.match(env, /OIDC_REDIRECT_URI/, 'env must declare OIDC_REDIRECT_URI (AC1)');
  assert.match(env, /JWT_SIGNING_SECRET/, 'env must declare JWT_SIGNING_SECRET (AC4)');
  assert.match(env, /JWT_ACCESS_TTL_SECONDS/, 'env must declare JWT_ACCESS_TTL_SECONDS with 15-min default (AC4)');
  assert.match(env, /JWT_REFRESH_TTL_SECONDS/, 'env must declare JWT_REFRESH_TTL_SECONDS (AC4)');
});

// ---------- Auth module structure ----------

test('AuthModule wires OidcService + JwtService + AuthController', () => {
  for (const f of ['auth.module.ts', 'auth.controller.ts', 'oidc.service.ts', 'jwt.service.ts']) {
    assert.ok(existsSync(resolve(apiSrc, 'auth', f)), `apps/api/src/auth/${f} must exist`);
  }
  const mod = readFileSync(resolve(apiSrc, 'auth/auth.module.ts'), 'utf8');
  assert.match(mod, /OidcService/, 'AuthModule must provide OidcService (AC1)');
  assert.match(mod, /JwtService|FcmJwtService/, 'AuthModule must provide a JWT service (AC4)');
  assert.match(mod, /AuthController/, 'AuthModule must register AuthController');
});

test('AppModule imports AuthModule', () => {
  const app = readFileSync(resolve(apiSrc, 'app.module.ts'), 'utf8');
  assert.match(app, /AuthModule/, 'AppModule must import AuthModule');
});

test('AuthController exposes /auth/oidc/init, /auth/oidc/callback, /auth/refresh', () => {
  const ctrl = readFileSync(resolve(apiSrc, 'auth/auth.controller.ts'), 'utf8');
  assert.match(ctrl, /@Controller\(\s*['"]auth['"]\s*\)/, 'AuthController must be mounted at /auth');
  // Each endpoint should be reachable via its decorator.
  assert.match(ctrl, /@Post\(\s*['"]oidc\/init['"]/, '/auth/oidc/init endpoint must exist (AC1)');
  assert.match(ctrl, /@Post\(\s*['"]oidc\/callback['"]/, '/auth/oidc/callback endpoint must exist (AC1)');
  assert.match(ctrl, /@Post\(\s*['"]refresh['"]/, '/auth/refresh endpoint must exist (AC4)');
});

// ---------- OIDC + JWT semantics ----------

test('OidcService caches per-organization openid-client Clients', () => {
  const src = readFileSync(resolve(apiSrc, 'auth/oidc.service.ts'), 'utf8');
  assert.match(src, /openid-client/, 'OidcService must depend on openid-client (AC1)');
  // Per-org cache so repeated lookups don't re-fetch discovery on every callback.
  assert.match(src, /Map|cache/i, 'OidcService must cache clients per organization (AC1)');
  // Discovery document is the entry point for openid-client.
  assert.match(src, /discovery|Issuer\.discover|allowInsecureRequests/, 'OidcService must use openid-client discovery (AC1)');
});

test('JwtService signs access tokens with the configured TTL and a configurable refresh token', () => {
  const src = readFileSync(resolve(apiSrc, 'auth/jwt.service.ts'), 'utf8');
  assert.match(src, /jose/, 'JwtService must depend on jose (AC4)');
  // Distinct access vs refresh signing methods so each lifetime is explicit.
  assert.match(src, /signAccess|signAccessToken/, 'JwtService must expose an access-token signer (AC4)');
  assert.match(src, /signRefresh|signRefreshToken/, 'JwtService must expose a refresh-token signer (AC4)');
  assert.match(src, /verify/, 'JwtService must expose a verify method');
});

// ---------- Web NextAuth wiring ----------

test('apps/web declares next-auth', () => {
  const pkg = JSON.parse(readFileSync(resolve(web, 'package.json'), 'utf8'));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  assert.ok(deps['next-auth'], 'next-auth must be installed (AC2)');
});

test('NextAuth route handler exists at /api/auth/[...nextauth]/route.ts', () => {
  const handler = resolve(webSrc, 'app/api/auth/[...nextauth]/route.ts');
  assert.ok(existsSync(handler), '/api/auth/[...nextauth]/route.ts must exist (AC2)');
  const src = readFileSync(handler, 'utf8');
  assert.match(src, /from\s+['"](\.\.\/)*[^'"]*lib\/auth['"]|from\s+['"]@\/lib\/auth['"]/, 'route handler must import the auth config (AC2)');
  assert.match(src, /export\s*\{\s*[^}]*GET[^}]*POST[^}]*\}|export\s+\{[^}]*handler\s+as\s+GET[^}]*handler\s+as\s+POST/, 'route handler must export GET and POST (NextAuth v4 App-Router pattern)');
});

test('NextAuth config sets session cookie attrs + 24h max + 2h idle (AC3)', () => {
  // Either at @/lib/auth.ts or wherever auth options live.
  const candidates = ['src/lib/auth.ts', 'src/lib/auth.config.ts', 'src/auth.ts'].map((p) => resolve(web, p));
  const cfgPath = candidates.find((p) => existsSync(p));
  assert.ok(cfgPath, `NextAuth config must exist at one of: ${candidates.map((c) => c.replace(root + '\\', '')).join(', ')}`);

  const cfg = readFileSync(cfgPath, 'utf8');
  // 24h expiry (86400 seconds) — accept either the literal number or 60*60*24-style math.
  assert.match(
    cfg,
    /maxAge\s*:\s*(?:86_?400|60\s*\*\s*60\s*\*\s*24|24\s*\*\s*60\s*\*\s*60|24\s*\*\s*3600)/,
    'session.maxAge must equal 24 hours in seconds (AC3)',
  );
  // 2h idle (7200 seconds) — updateAge controls how often the session is touched.
  assert.match(
    cfg,
    /updateAge\s*:\s*(?:7_?200|2\s*\*\s*60\s*\*\s*60|2\s*\*\s*3600|60\s*\*\s*60\s*\*\s*2)/,
    'session.updateAge must equal 2 hours in seconds (AC3 — idle timeout)',
  );
  // Cookie attrs.
  assert.match(cfg, /httpOnly\s*:\s*true/, 'session cookie must be HttpOnly (AC3)');
  assert.match(cfg, /sameSite\s*:\s*['"]lax['"]/, 'session cookie must be SameSite=Lax (AC3)');
  // `secure` is set conditionally on prod for local dev convenience; we just
  // require some explicit secure declaration is present.
  assert.match(cfg, /secure\s*:/, 'session cookie config must declare secure (AC3)');
});

test('NextAuth config uses a credentials/OIDC provider that hands off to the API (AC2)', () => {
  const candidates = ['src/lib/auth.ts', 'src/lib/auth.config.ts', 'src/auth.ts'].map((p) => resolve(web, p));
  const cfgPath = candidates.find((p) => existsSync(p));
  const cfg = readFileSync(cfgPath, 'utf8');
  assert.match(cfg, /CredentialsProvider|Credentials\(/, 'NextAuth config must use Credentials provider that posts to the API (AC2)');
});

// ---------- Login + OIDC callback wired through NextAuth ----------

test('Login page initiates the OIDC flow via /auth/oidc/init', () => {
  const page = readFileSync(resolve(webSrc, 'app/login/page.tsx'), 'utf8');
  // The login page does NOT call signIn directly — it kicks off the IdP
  // redirect. signIn happens on the callback page after the IdP returns.
  assert.match(page, /\/auth\/oidc\/init/, 'login page must POST to /auth/oidc/init (AC2)');
});

test('OIDC callback page exists and invokes signIn() to complete the handshake', () => {
  const callback = resolve(webSrc, 'app/auth/oidc/callback/page.tsx');
  assert.ok(existsSync(callback), 'OIDC callback page must exist at /auth/oidc/callback (AC2)');
  const src = readFileSync(callback, 'utf8');
  assert.match(src, /signIn\(\s*['"]fcm-oidc['"]/, 'callback page must call signIn("fcm-oidc", ...) (AC2)');
  assert.match(src, /code/, 'callback page must read `code` from the URL (AC2)');
  assert.match(src, /state/, 'callback page must read `state` from the URL (AC2)');
});

// ---------- Server-side PKCE/state store ----------

test('OidcStateStore exists and is wired into AuthModule', () => {
  const storePath = resolve(apiSrc, 'auth/oidc-state.store.ts');
  assert.ok(existsSync(storePath), 'OidcStateStore must exist (AC1 — PKCE verifier stays server-side)');
  const mod = readFileSync(resolve(apiSrc, 'auth/auth.module.ts'), 'utf8');
  assert.match(mod, /OidcStateStore/, 'AuthModule must provide OidcStateStore');
});

test('NextAuth jwt callback wires the refresh-rotation path (AC4)', () => {
  const cfg = readFileSync(resolve(webSrc, 'lib/auth.ts'), 'utf8');
  assert.match(cfg, /refreshApiAccessToken/, 'auth.ts must define a refresh helper');
  assert.match(
    cfg,
    /accessTokenExpiresAt/,
    'jwt callback must track an access-token expiry timestamp to drive refresh (AC4)',
  );
});
