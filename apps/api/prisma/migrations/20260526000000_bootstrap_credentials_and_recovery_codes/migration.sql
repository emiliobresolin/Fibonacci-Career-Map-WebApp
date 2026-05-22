-- Story 2-7: bootstrap admin fallback credentials + OIDC outage recovery codes.
-- PRD FR-1.2, Arch §10.1, AR-6.
--
-- Two tables, both tenant-scoped:
--
--   bootstrap_credentials  — at most one row per organization. Stores the
--     scrypt-hashed username/password the first-run admin uses to log in
--     before OIDC is configured. Self-disables when the first OIDC-linked
--     admin successfully signs in (disabled_at NOT NULL). A disabled row
--     is left in place for forensics; deleting would lose the audit trail.
--
--   recovery_codes  — exactly 10 rows per organization at bootstrap. Each
--     row stores a scrypt hash of a single-use code; the plaintext is
--     surfaced ONCE to the admin at issuance and then irretrievable. A
--     code self-burns on redemption (redeemed_at NOT NULL). Partial-unique
--     idx on (org, redeemed_at IS NULL) is unnecessary — duplicates
--     would only matter for active codes, and the hash uniqueness already
--     covers that case implicitly.
--
-- RLS posture: both tables are tenant-scoped (organization_id NOT NULL)
-- and join the tenant_isolation sweep from Story 2-6. The bootstrap and
-- recovery endpoints set `app.current_org_id` from the org-slug lookup
-- before reading/writing.

-- ─── bootstrap_credentials ─────────────────────────────────────────────────
CREATE TABLE "bootstrap_credentials" (
    "id"               UUID NOT NULL,
    "organization_id"  UUID NOT NULL,
    "username"         TEXT NOT NULL,
    -- scrypt hash of (salt, password), formatted as "scrypt$<N>$<r>$<p>$<saltB64>$<derivedB64>".
    -- The format is read-by-the-service rather than stored as a structured column
    -- so we can rotate parameters without a migration.
    "password_hash"    TEXT NOT NULL,
    -- Set when the first OIDC-linked ADMIN successfully signs in for this org.
    -- Once set, /auth/bootstrap-login rejects with a structured error.
    "disabled_at"      TIMESTAMPTZ,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "bootstrap_credentials_pkey" PRIMARY KEY ("id")
);

-- One bootstrap credential per organization. A future "regenerate bootstrap"
-- admin action would DELETE + INSERT inside a transaction.
CREATE UNIQUE INDEX "bootstrap_credentials_organization_id_key"
    ON "bootstrap_credentials"("organization_id");

CREATE UNIQUE INDEX "bootstrap_credentials_organization_id_username_key"
    ON "bootstrap_credentials"("organization_id", "username");

ALTER TABLE "bootstrap_credentials"
    ADD CONSTRAINT "bootstrap_credentials_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- RLS (Story 2-6 pattern)
ALTER TABLE "bootstrap_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bootstrap_credentials" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_bootstrap_credentials" ON "bootstrap_credentials"
    USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);

-- ─── recovery_codes ────────────────────────────────────────────────────────
CREATE TABLE "recovery_codes" (
    "id"                  UUID NOT NULL,
    "organization_id"     UUID NOT NULL,
    -- scrypt hash of the plaintext recovery code. Format mirrors bootstrap_credentials.password_hash.
    "code_hash"           TEXT NOT NULL,
    -- Set when an admin redeems this code via /auth/recovery-redeem.
    -- A non-NULL value renders the code permanently unusable (self-burn).
    "redeemed_at"         TIMESTAMPTZ,
    -- The admin user_id that consumed this code. NULL until redeemed.
    "redeemed_by_user_id" UUID,
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recovery_codes_organization_id_idx" ON "recovery_codes"("organization_id");
-- Partial index over un-redeemed rows speeds up the "is there an unburned
-- code that matches this hash?" lookup on the redemption hot path.
CREATE INDEX "recovery_codes_active_idx"
    ON "recovery_codes"("organization_id")
    WHERE "redeemed_at" IS NULL;

ALTER TABLE "recovery_codes"
    ADD CONSTRAINT "recovery_codes_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- RLS (Story 2-6 pattern)
ALTER TABLE "recovery_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recovery_codes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_recovery_codes" ON "recovery_codes"
    USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
