-- Story 2-6: Layer-3 Row-Level Security policies on tenant-scoped tables
-- (Arch §10.3 Layer 3 + §10.4, AR-4, NFR-4.4).
--
-- The defense model:
--   • Layer 1 (Story 2-4): NestJS AuthGuard rejects unauthenticated /
--     forbidden role requests before any DB query is issued.
--   • Layer 2 (Story 2-5): Domain services receive ActorContext and call
--     SelfApprovalGuard.ensureNotSelf when relevant.
--   • Layer 3 (this story): Postgres RLS rejects any cross-tenant DML
--     even when the application code forgets to scope.
--
-- The policy:
--   USING / WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid)
--
-- `current_setting(name, missing_ok=true)` returns NULL when the GUC is
-- unset, which means the policy comparison evaluates to NULL → row
-- excluded. Closed-fail: a query that runs WITHOUT the GUC set sees an
-- empty result set rather than every row. The app layer is responsible
-- for setting `app.current_org_id` via `withOrgScope(prisma, orgId, fn)`
-- (apps/api/src/prisma/rls.helpers.ts).
--
-- FORCE ROW LEVEL SECURITY makes the policy apply even to the table
-- owner. Without FORCE, a superuser / table-owner connection (the
-- migrator role) bypasses the policy — that's fine for migrations
-- themselves but the app role must NOT be the table owner in production.
--
-- Coverage in this migration: users + role_assignments.
--
-- Intentionally NOT covered in this migration: audit_events + outbox_events.
-- Both are operated on by cross-tenant infrastructure (the outbox-relay
-- worker reads every unpublished outbox row across all organizations,
-- and the audit-write path lands rows for whichever org's outbox row
-- triggered it). Enabling RLS on those tables without a multi-role DB
-- setup (a BYPASSRLS role for the relay + a normal RLS-bound role for
-- the app) would break the relay pipeline. Tracked as a follow-up
-- story: enable audit_events + outbox_events RLS together with the
-- Terraform multi-role provisioning work.
--
-- Future tenant-scoped tables (configuration, evidence, score_snapshots,
-- etc.) MUST follow the same RLS pattern when their migration ships.
-- The pattern is captured at the bottom of this file.

-- ─── users ──────────────────────────────────────────────────────────────────
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_users" ON "users"
  USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);

-- ─── role_assignments ──────────────────────────────────────────────────────
ALTER TABLE "role_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_assignments" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_role_assignments" ON "role_assignments"
  USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);

-- ─── organizations (tenant root) ───────────────────────────────────────────
-- The organizations table is the tenant root, not a tenant-scoped table.
-- The OIDC org-slug lookup MUST work without an org context — the user's
-- whole reason for hitting auth is to GET an org context. So RLS on
-- organizations is intentionally omitted. Access is gated at the
-- application + permission layer.

-- ─── Notes for future tenant-table migrations ──────────────────────────────
-- Adding a new tenant-scoped table requires three things:
--   1. The table carries `organization_id UUID NOT NULL` (existing convention).
--   2. The new table's migration appends:
--        ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
--        ALTER TABLE "<table>" FORCE ROW LEVEL SECURITY;
--        CREATE POLICY "tenant_isolation_<table>" ON "<table>"
--          USING (organization_id = current_setting('app.current_org_id', true)::uuid)
--          WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
--   3. Every code path that queries the new table is wrapped in
--      `withOrgScope(prisma, orgId, fn)`. The HTTP RlsContextInterceptor
--      stamps the orgId into AsyncLocalStorage; the BullMQ wrapper does
--      the same from `actorFromJobData`.
