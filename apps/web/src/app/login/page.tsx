'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Login page — Story 2-2 AC2. The user enters their organization slug; we
// call /auth/oidc/init on the api, which stashes the PKCE verifier + nonce
// server-side keyed by an opaque `state` token. We persist only that state
// token in sessionStorage so the OIDC callback page can echo it back, then
// redirect the browser to the IdP. The full callback handshake completes
// in /auth/oidc/callback (the page under src/app/auth/oidc/callback).

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export default function LoginPage(): JSX.Element {
  const [orgSlug, setOrgSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // useRef guard for double-submit: setState is async and a fast double-click
  // could fire two /auth/oidc/init calls before `submitting` flips. The
  // synchronous ref short-circuits the second click.
  const inFlight = useRef(false);

  useEffect(() => {
    // Clear any stale pending entry from an abandoned login (user closed the
    // IdP tab, navigated back, etc). The state token in it is single-use on
    // the api side anyway, but tidying up reduces XSS exposure surface.
    try {
      sessionStorage.removeItem('fcm.oidc.pending');
    } catch {
      // Inaccessible sessionStorage — ignore.
    }
  }, []);

  async function beginLogin(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (inFlight.current) return;
    if (!orgSlug.trim()) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/oidc/init`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationSlug: orgSlug.trim() }),
      });
      if (!res.ok) {
        setError('Unknown organization or OIDC not configured.');
        setSubmitting(false);
        inFlight.current = false;
        return;
      }
      const data = (await res.json()) as { authorizationUrl: string; state: string };
      // Persist only the state token. PKCE verifier + nonce live on the api
      // in OidcStateStore — they never travel through the browser.
      sessionStorage.setItem(
        'fcm.oidc.pending',
        JSON.stringify({ organizationSlug: orgSlug.trim(), state: data.state }),
      );
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setError(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
      setSubmitting(false);
      inFlight.current = false;
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6" aria-labelledby="login-heading">
      <section className="w-full max-w-sm space-y-6">
        <header className="space-y-2 text-center">
          <h1 id="login-heading" className="text-2xl font-semibold tracking-tight">
            Sign in to FCM
          </h1>
          <p className="text-sm text-muted-foreground">Enter your organization to continue.</p>
        </header>
        <form className="space-y-4" onSubmit={beginLogin} noValidate>
          <Input
            type="text"
            placeholder="organization-slug"
            aria-label="Organization slug"
            value={orgSlug}
            onChange={(e) => setOrgSlug(e.target.value)}
            disabled={submitting}
          />
          <Button type="submit" className="w-full" disabled={submitting || !orgSlug.trim()}>
            Continue with SSO
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
