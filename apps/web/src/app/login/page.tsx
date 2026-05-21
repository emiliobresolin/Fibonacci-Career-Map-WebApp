import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Placeholder login page for Story 1-3. The real OIDC/SSO flow lands with EPIC-2.
// Renders dark by default (per the .dark class on <html>) and uses the
// shadcn-style primitives so the design language is consistent from day one.
//
// Not a real <form> yet: inputs are disabled and there is no submit handler.
// EPIC-2 promotes this to a real form (probably a client component with NextAuth).
export default function LoginPage(): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center p-6" aria-labelledby="login-heading">
      <section className="w-full max-w-sm space-y-6">
        <header className="space-y-2 text-center">
          <h1 id="login-heading" className="text-2xl font-semibold tracking-tight">
            Sign in to FCM
          </h1>
          <p className="text-sm text-muted-foreground">Authentication is wired in EPIC-2 (Identity, SSO, RBAC).</p>
        </header>
        <div className="space-y-4">
          <Input type="email" placeholder="you@example.com" aria-label="Email" disabled />
          <Button type="button" className="w-full" disabled>
            Continue with SSO (coming soon)
          </Button>
        </div>
      </section>
    </main>
  );
}
