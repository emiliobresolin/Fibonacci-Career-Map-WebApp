# Runbook: OIDC outage recovery

**Scope:** restoring admin access to a single FCM organization when the upstream IdP (Okta / Auth0 / Azure AD) is unavailable.

**Audience:** on-call operator + organization administrator.

**Story:** 2-7 (FR-1.2)

---

## When to use this runbook

Trigger this procedure when **both** of the following are true:

1. The organization's OIDC IdP is unreachable (login pages 5xx, IdP status page red, etc.) AND
2. An organization administrator needs to log into FCM **right now** to take a time-critical action (incident response, locking out a compromised user, etc.).

If the IdP is reachable but a specific user can't log in, this is NOT the right runbook — check the user's IdP entitlements first.

---

## Prerequisites

- The organization has at least one **recovery code** issued at bootstrap. These are 16-character codes (4 groups of 4 hex digits, e.g. `f8a3-9c12-77be-2401`) that were delivered to the org admin via secure channel during org provisioning. Codes are single-use; check the org's secure store for one that has NOT been redeemed.
- You know one organization admin's **email** (the address used to provision the admin user).
- You know the organization's **slug** (the URL-safe identifier used in the OIDC init endpoint).

If no recovery code is available, this runbook cannot help — escalate to FCM platform engineering for a manual database-level reset.

---

## Procedure

### Step 1 — Verify the FCM API is reachable

```sh
curl -sf https://<fcm-host>/healthz
# expected: {"status":"ok"}
```

If `/healthz` is failing, the issue is FCM-side, not OIDC-side. Switch to the `api-down` runbook.

### Step 2 — Redeem the recovery code

```sh
curl -X POST https://<fcm-host>/auth/recovery-redeem \
  -H 'Content-Type: application/json' \
  -d '{
    "organizationSlug": "<org-slug>",
    "email": "<admin-email>",
    "recoveryCode": "<recovery-code>"
  }'
```

**On success** — response shape:

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "...", "displayName": "...", "organizationId": "..." },
  "role": "ADMIN"
}
```

The `accessToken` is a standard FCM bearer JWT (15-minute TTL) — use it in the `Authorization: Bearer <token>` header for subsequent API calls until the IdP recovers and normal OIDC login resumes.

**On failure** — every failure mode returns `401 Unauthorized` with `{"message":"Invalid recovery code"}` so an attacker cannot distinguish between "wrong slug", "wrong email", "wrong code", or "code already burned". Verify each input against the secure store and try again. If a code is intermittently failing on retry, it has likely already been redeemed.

### Step 3 — Burn count and re-provisioning

A successful redemption **burns the code** — it cannot be reused. Each org receives **10 codes** at bootstrap (`RecoveryCodesService.BATCH_SIZE`). Once a code is redeemed, mark it spent in the org's secure store.

If only one or two codes remain after the recovery action, schedule a re-provisioning run with the platform engineering team to issue a fresh batch (this requires a new bootstrap-style admin action and is tracked separately).

### Step 4 — Restore OIDC-only flow

Once the upstream IdP recovers:

1. Verify a normal admin sign-in through the OIDC dance works end-to-end.
2. No additional cleanup is required — recovery codes are independent of the OIDC channel and a successful OIDC admin sign-in does NOT burn any remaining codes.

---

## What recovery codes do NOT cover

- **Bootstrap-admin login** (`POST /auth/bootstrap-login`) — a separate, username/password fallback that self-disables once the org's first OIDC-linked admin signs in. After OIDC is configured AND used, this path is rejected. Use recovery codes instead.
- **Non-admin users** — codes are bound to the `ADMIN` role only. A manager or employee cannot redeem.
- **Cross-organization recovery** — each org has its own pool of 10 codes. A code from org A cannot redeem against org B (the policy enforces this at the RLS layer too).

---

## Audit trail

Every redemption attempt — success OR failure — is logged in the FCM API server's structured pino log with `op: 'redeem_success'` or `op: 'redeem_fail'`. The matched `codeId` and `adminUserId` are captured for successful redemptions. Once Story 3-4's `AuditEvent` taxonomy is extended to cover bootstrap + recovery events (planned follow-up), each redemption will also land an immutable `audit_events` row via the transactional outbox.

---

## Known follow-ups

- Outbox-emitted audit events for redemption (depends on AuditEvent taxonomy extension in `@fcm/domain-contracts`).
- Operator-facing re-provisioning endpoint to refill the recovery-code pool after multiple redemptions.
- Self-service code rotation UI for organization admins (post-MVP).
