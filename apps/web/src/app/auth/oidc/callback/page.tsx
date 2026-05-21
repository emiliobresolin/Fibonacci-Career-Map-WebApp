'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';

// OIDC callback page — Story 2-2 AC2 completion. The IdP redirects the
// browser back to OIDC_REDIRECT_URI with `?code=...&state=...` in the URL.
// We read both, hand them to NextAuth's `signIn('fcm-oidc', ...)` which
// in turn POSTs to the api's /auth/oidc/callback. The PKCE verifier and
// nonce stay server-side in the api's OidcStateStore — the browser never
// sees them, only the opaque `state` token.

export default function OidcCallbackPage(): JSX.Element {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Strip the pending entry the login page may have stashed; once we have
    // the IdP response in URL params, it serves no further purpose.
    try {
      sessionStorage.removeItem('fcm.oidc.pending');
    } catch {
      // Inaccessible sessionStorage (private mode, sandboxed iframe). Ignore.
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const idpError = params.get('error');

    if (idpError) {
      setError(`Login was cancelled or denied (${idpError}).`);
      return;
    }
    if (!code || !state) {
      setError('Missing code or state from identity provider.');
      return;
    }

    void (async () => {
      const res = await signIn('fcm-oidc', { redirect: false, code, state });
      if (res?.ok) {
        window.location.replace('/map');
      } else {
        setError('Sign-in failed. Please try again from the login page.');
      }
    })();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-6" aria-labelledby="oidc-callback-heading">
      <section className="w-full max-w-sm space-y-4 text-center">
        <h1 id="oidc-callback-heading" className="text-xl font-semibold tracking-tight">
          Signing you in…
        </h1>
        {error ? (
          <>
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <a className="text-sm underline" href="/login">
              Return to login
            </a>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Please wait while we complete authentication.</p>
        )}
      </section>
    </main>
  );
}
