# Story 2.2: OIDC/SSO login via openid-client and NextAuth session

Status: backlog

## Story

As a user,
I want to log in through my organization's identity provider,
so that I can use FCM without a password.

## Acceptance Criteria

1. `apps/api` exposes OIDC callback endpoints using `openid-client`; discovery document is loaded from per-org config.
2. `apps/web` uses NextAuth.js configured with a custom credentials/OIDC adapter that hands off to the API.
3. Successful authentication sets an HTTP-only, Secure, SameSite=Lax session cookie; session has 24 h expiry and 2 h idle timeout.
4. The API issues a short-lived (15 min) JWT bearer token used for subsequent API calls; refresh happens through a secure server-side web endpoint.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3
- [ ] Task covering AC #4

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E2.1

### References

- Arch §10.1
- FR-1.1, FR-1.5
- AD-11
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
