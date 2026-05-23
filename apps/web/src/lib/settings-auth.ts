// Story 7-11 AC4 — admin-redirect server helper. Reads the same dev
// cookie the existing DLQ page reads, returns the token or null.
//
// Production wiring: NextAuth's session module surfaces the bearer
// token; for now this matches the dev shortcut already in use at
// apps/web/src/app/settings/ops/dlq/page.tsx so the settings tree
// doesn't fork the auth flow.
//
// The ADMIN role check happens server-side in the API (every settings
// endpoint is @Roles('ADMIN')). The UI mirrors that by redirecting
// any non-admin user away from /settings — but if the redirect ever
// misfires, the API still returns 403.

export async function getServerToken(): Promise<string | null> {
  const { cookies } = await import('next/headers');
  const store = cookies();
  return store.get('fcm-access-token')?.value ?? null;
}
