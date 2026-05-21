import type { NextAuthOptions, Session, User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';

// FCM uses NextAuth as the server-side session holder. The IdP handshake itself
// runs against our `fcm-api` (OIDC code exchange happens inside the api, not
// inside NextAuth) — NextAuth's role is to (a) hold the access+refresh tokens
// in its server-side JWT, (b) issue a session cookie to the browser, and (c)
// re-issue access tokens on demand via the api's /auth/refresh endpoint.

/**
 * Lazy API base URL resolver. We avoid throwing at module evaluation time
 * because Next.js's `next build` step loads route modules during "Collect
 * page data" — a hard throw there fails the build even when the operator
 * just hasn't materialized prod secrets yet (a normal pre-deploy state).
 * Instead we throw at first-use: if a real request lands in production
 * without API_BASE_URL set, NextAuth will refuse to proceed.
 */
function getApiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL;
  if (url) return url;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL (or API_BASE_URL) must be set in production for NextAuth to reach fcm-api',
    );
  }
  return 'http://localhost:3000';
}

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;

/**
 * The OIDC code exchange is server-side only. The web caller routes the user
 * through the IdP using URLs minted by `POST /auth/oidc/init`, then NextAuth's
 * Credentials.authorize() finishes the exchange against `POST /auth/oidc/callback`.
 * This keeps the access/refresh tokens inside server-side memory — they never
 * touch the browser.
 */
export const authOptions: NextAuthOptions = {
  ...(NEXTAUTH_SECRET ? { secret: NEXTAUTH_SECRET } : {}),
  // JWT-strategy session so we can stash the api-issued access + refresh tokens
  // inside the encrypted server-side JWT cookie. The browser only ever sees the
  // opaque NextAuth session cookie; the api JWTs are decrypted server-side.
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24h hard expiry — AC3
    updateAge: 2 * 60 * 60, // 2h idle timeout — AC3
  },
  // HttpOnly + Secure + SameSite=Lax — AC3.
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === 'production' ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  providers: [
    CredentialsProvider({
      // Server-side hand-off from the OIDC callback page. The web app's
      // /auth/oidc/callback page calls `signIn('fcm-oidc', { code, state })`
      // — NextAuth then invokes authorize() below, which POSTs to the api's
      // /auth/oidc/callback to mint the JWT pair and resolve the FCM user.
      id: 'fcm-oidc',
      name: 'FCM OIDC',
      credentials: {
        code: { type: 'text' },
        state: { type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.code || !credentials.state) return null;
        let res: Response;
        try {
          res = await fetch(`${getApiBaseUrl()}/auth/oidc/callback`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: credentials.code, state: credentials.state }),
          });
        } catch {
          // Network failure → opaque auth-fail UX. The api already logs the
          // underlying reason on its end.
          return null;
        }
        if (!res.ok) {
          return null;
        }
        const data = (await res.json()) as {
          accessToken: string;
          refreshToken: string;
          user: { id: string; email: string; displayName: string; organizationId: string };
          role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
        };
        return {
          // NextAuth User shape — `id` + arbitrary extra fields. The extras
          // are picked up by the jwt() callback below and stashed into the
          // server-side JWT.
          id: data.user.id,
          email: data.user.email,
          name: data.user.displayName,
          organizationId: data.user.organizationId,
          role: data.role,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          // Refresh ahead of the 15-min access TTL; jose tokens encode `exp`
          // in seconds since epoch, but the api hand-back doesn't surface it
          // directly. Approximate via accessTtl - 60s safety window.
          accessTokenExpiresAt: Date.now() + (15 * 60 - 60) * 1000,
        } as unknown as User;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // First call (right after authorize): stash the api tokens into the JWT.
      if (user) {
        const u = user as unknown as {
          accessToken: string;
          refreshToken: string;
          organizationId: string;
          role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
          accessTokenExpiresAt: number;
        };
        token['accessToken'] = u.accessToken;
        token['refreshToken'] = u.refreshToken;
        token['organizationId'] = u.organizationId;
        token['role'] = u.role;
        token['accessTokenExpiresAt'] = u.accessTokenExpiresAt;
        return token;
      }

      // Subsequent calls: rotate the access token if it's within the safety
      // window. We only rotate the access token here; the refresh token is
      // still single-use-after-rotation work that Story 2-3 owns (Redis-backed
      // jti tracking).
      const t = token as JWT & {
        accessToken?: string;
        refreshToken?: string;
        accessTokenExpiresAt?: number;
      };
      if (!t.refreshToken || !t.accessTokenExpiresAt) return token;
      if (Date.now() < t.accessTokenExpiresAt) return token;

      const rotated = await refreshApiAccessToken(t.refreshToken);
      if (!rotated) {
        // Refresh failed — leave the existing claims in place so the browser
        // sees a still-valid session shell, but the next api call will 401
        // and the client-side error boundary will redirect to /login.
        return token;
      }
      t.accessToken = rotated.accessToken;
      t.refreshToken = rotated.refreshToken;
      t.accessTokenExpiresAt = Date.now() + (15 * 60 - 60) * 1000;
      return t;
    },
    async session({ session, token }) {
      // Surface the role + org to the client (browser-readable session fields).
      // The api access/refresh tokens stay server-side — the browser only sees
      // the role + org + standard user fields. Assign conditionally so we
      // never write `undefined` into an optional field under
      // exactOptionalPropertyTypes.
      const t = token as JWT & { role?: string; organizationId?: string };
      const s = session as Session & { role?: string; organizationId?: string };
      if (t.role !== undefined) s.role = t.role;
      if (t.organizationId !== undefined) s.organizationId = t.organizationId;
      return session;
    },
  },
};

/**
 * Server-side helper to refresh the api JWT pair. Called by the NextAuth
 * jwt() callback when the access token is past its safety window. The actual
 * logic lives in `apps/api/src/auth/auth.controller.ts:refresh`; this wrapper
 * just forwards the refresh token and returns the new pair (or null on
 * failure / network error).
 */
export async function refreshApiAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { accessToken: string; refreshToken: string };
  } catch {
    return null;
  }
}
