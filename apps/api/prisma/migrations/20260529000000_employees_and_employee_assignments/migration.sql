-- Story 6-2a: Identity-domain tables `employees` + `employee_assignments`
-- (Arch §6.2, PRD §4.2 / §6.1).
--
-- `employees` is the entity every downstream domain (evidence,
-- promotion_records, score_snapshots, …) FKs to. `employee_assignments`
-- carries the role + manager hierarchy and is the canonical source
-- for "who reports to whom" queries in Epic 9/10/13.
--
-- Two FK-cascade postures are intentional:
--   * employees → organizations  CASCADE   (deleting a tenant wipes employees)
--   * employees → users          CASCADE   (deleting a user wipes their employee profile)
--   * employees → career_tracks  RESTRICT  (config delete blocked until reassign)
--   * employees → levels         RESTRICT  (same)
--   * employee_assignments → employees  CASCADE   (deactivating an employee wipes assignments)
--   * employee_assignments → manager_employees  SET NULL  (a removed manager unparents reports rather than deleting them)
--
-- AC3 of this story: a BEFORE INSERT/UPDATE trigger on
-- employee_assignments rejects self-management
-- (manager_employee_id = employee_id). Without this, an admin-side bug
-- could land a row asserting an employee is their own manager — the
-- org-structure graph algorithms downstream all assume acyclicity at
-- the trivial level.

-- ─── employees ─────────────────────────────────────────────────────────────

CREATE TABLE "employees" (
    "id"               UUID NOT NULL,
    "organization_id"  UUID NOT NULL,
    "user_id"          UUID NOT NULL,
    "career_track_id"  UUID,
    "level_id"         UUID,
    "assigned_at"      TIMESTAMPTZ,
    "deactivated_at"   TIMESTAMPTZ,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employees_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "employees_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "employees_career_track_id_fkey"
        FOREIGN KEY ("career_track_id") REFERENCES "career_tracks"("id") ON DELETE RESTRICT,
    CONSTRAINT "employees_level_id_fkey"
        FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE RESTRICT
);

-- AC1: one employee row per (organization, user). A user being
-- onboarded as an employee twice in the same org is an admin-side
-- bug; the DB-level constraint catches it.
CREATE UNIQUE INDEX "employees_organization_id_user_id_unique"
    ON "employees"("organization_id", "user_id");
CREATE INDEX "employees_organization_id_idx" ON "employees"("organization_id");
CREATE INDEX "employees_career_track_id_idx" ON "employees"("career_track_id");
CREATE INDEX "employees_level_id_idx" ON "employees"("level_id");
CREATE INDEX "employees_user_id_idx" ON "employees"("user_id");

-- AC1 + AC5: RLS sweep on employees.
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employees" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_employees" ON "employees"
    USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);

-- ─── employee_assignments ──────────────────────────────────────────────────

CREATE TABLE "employee_assignments" (
    "id"                       UUID NOT NULL,
    "employee_id"              UUID NOT NULL,
    "organization_id"          UUID NOT NULL,
    "role"                     "Role" NOT NULL,
    "manager_employee_id"      UUID,
    "assigned_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deactivated_at"           TIMESTAMPTZ,
    "created_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "employee_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_assignments_employee_id_fkey"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "employee_assignments_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "employee_assignments_manager_employee_id_fkey"
        FOREIGN KEY ("manager_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL
);

-- AC2: PARTIAL unique on (employee, org, role) WHERE deactivated_at IS NULL.
-- Same shape as the role_assignments partial-unique from Story 2-1 — a
-- re-grant of a previously-soft-deactivated role lands as a fresh row.
CREATE UNIQUE INDEX "employee_assignments_active_unique"
    ON "employee_assignments"("employee_id", "organization_id", "role")
    WHERE "deactivated_at" IS NULL;

CREATE INDEX "employee_assignments_organization_id_idx"
    ON "employee_assignments"("organization_id");
CREATE INDEX "employee_assignments_employee_id_idx"
    ON "employee_assignments"("employee_id");
CREATE INDEX "employee_assignments_manager_employee_id_idx"
    ON "employee_assignments"("manager_employee_id");

-- AC3: BEFORE INSERT/UPDATE trigger rejects self-management.
-- A row asserting `manager_employee_id = employee_id` is always a bug
-- — every org-structure algorithm downstream assumes the manager
-- hierarchy is at least irreflexive (no self-loops).
--
-- We model this as a separate immutable function so the trigger body
-- stays one line. SECURITY DEFINER is NOT used — the function only
-- inspects the row being inserted/updated, no privileged access.
CREATE OR REPLACE FUNCTION "reject_self_management"()
    RETURNS TRIGGER
    LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."manager_employee_id" IS NOT NULL
       AND NEW."manager_employee_id" = NEW."employee_id" THEN
        RAISE EXCEPTION
            'employee_assignments: an employee cannot manage themselves (employee_id=%, manager_employee_id=%)',
            NEW."employee_id", NEW."manager_employee_id"
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "employee_assignments_reject_self_management"
    BEFORE INSERT OR UPDATE ON "employee_assignments"
    FOR EACH ROW EXECUTE FUNCTION "reject_self_management"();

-- AC2 + AC5: RLS sweep on employee_assignments.
ALTER TABLE "employee_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_employee_assignments" ON "employee_assignments"
    USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
