// Stubbed session check for Story 1-3. Real session reading lands with EPIC-2
// (Identity, SSO, Tenancy, RBAC). The truthy branch can be exercised in dev/CI
// by setting FCM_STUB_AUTHED=true so the redirect-to-/map path is reachable
// before EPIC-2 swaps this function for the real implementation.

export type StubSession = {
  authenticated: boolean;
};

export function getStubSession(): StubSession {
  return { authenticated: process.env['FCM_STUB_AUTHED'] === 'true' };
}
