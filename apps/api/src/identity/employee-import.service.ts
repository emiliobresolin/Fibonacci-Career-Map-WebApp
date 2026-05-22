import { randomUUID } from 'node:crypto';

import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { ActorContext } from '../auth/actor-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';
import { CsvParseError, parseCsv } from './csv-parser.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUIRED_HEADERS = [
  'email',
  'display_name',
  'track_slug',
  'level_code',
  'manager_email',
] as const;

/** A parsed-and-shape-validated CSV row, BEFORE manager / track / level
 *  resolution. Slugs and emails are normalized (trim + lowercase for
 *  emails). Optional fields are null when omitted. */
type ParsedRow = {
  /** 1-based row number as seen by the operator (header is row 1, so
   *  the first data row is row 2). Used in every error report. */
  rowNumber: number;
  email: string;
  displayName: string;
  trackSlug: string | null;
  levelCode: string | null;
  managerEmail: string | null;
};

/** A structured error keyed at the row + field level (AC5). */
export type ImportRowError = {
  row: number;
  field: 'email' | 'display_name' | 'track_slug' | 'level_code' | 'manager_email' | 'csv';
  reason: string;
};

/** Per-row outcome in a successful preview (dry-run) or commit. */
export type ImportRowPreview = {
  row: number;
  email: string;
  displayName: string;
  /** Resolved IDs — null when the field was empty OR when the slug/code
   *  did not match any configuration. The validation pass already
   *  rejects rows that referenced a non-existent slug/code, so by the
   *  time a row reaches the preview these are null only when omitted. */
  careerTrackId: string | null;
  levelId: string | null;
  managerEmail: string | null;
  /** Set when manager_email resolves to a row earlier in the SAME CSV
   *  (the manager_employee_id is materialized at commit time). */
  managerSource: 'existing' | 'in_batch' | null;
};

export type ImportReport = {
  totalRows: number;
  validRows: number;
  errors: ImportRowError[];
  /** Per-row preview surfaced even when errors are present, so the
   *  operator can spot-check what would commit. Length === validRows
   *  in the all-valid case; smaller when some rows hit errors. */
  preview: ImportRowPreview[];
};

export type ImportResult = {
  totalRows: number;
  importedCount: number;
  employees: Array<{
    row: number;
    employeeId: string;
    userId: string;
    email: string;
  }>;
};

/**
 * EmployeeImportService (Story 6-5).
 *
 * Two entry points share one validation pipeline:
 *
 *   • `dryRun(orgId, csv)` — parse + validate, return `ImportReport`.
 *     No writes. Surfaces every error at the row+field level so the
 *     operator can fix the source file once and re-upload.
 *
 *   • `commit(orgId, csv, actor)` — run the same validation, then
 *     write all rows in ONE `withOrgScope` transaction. Every row
 *     produces a `users` + `employees` + optional
 *     `employee_assignments` triple AND an `employee.imported`
 *     outbox event. AC6: ANY failure rolls the whole batch back.
 *
 * Why a single tx for the whole batch:
 *   AC6 explicitly mandates "all side-effects roll back on commit
 *   failure". A row-at-a-time loop would leak partial state on the
 *   first FK violation. The cost is that a 1000-row CSV holds a tx
 *   open for ~1s in practice — acceptable for an admin tool that
 *   runs at most a few times per onboarding.
 *
 * Why the import service touches `users` / `employees` /
 * `employee_assignments` directly rather than going through
 * `EmployeesRepository`:
 *   The repository's API is per-row + per-method, each in its own
 *   `withOrgScope` tx. Funneling 1000 rows through the repo would
 *   open 3000 transactions and break AC6's atomicity. The seeding
 *   service (Story 6-3) uses the same pattern; both are privileged
 *   orchestrators, not CRUD surfaces.
 *
 * Why we eagerly resolve track/level/manager BEFORE the commit tx:
 *   The lookups are read-only and benefit from being outside the
 *   write tx (shorter critical section). We also need the resolved
 *   IDs for the dry-run preview, which by definition does no writes.
 *   The trade-off is that a track/level deleted between dry-run and
 *   commit would surface as an FK violation rather than a clean
 *   validation error — that's an acceptable corner-case for an
 *   admin-driven flow.
 */
@Injectable()
export class EmployeeImportService {
  private readonly logger = new Logger(EmployeeImportService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async dryRun(organizationId: string, csv: string): Promise<ImportReport> {
    const { report } = await this.validate(organizationId, csv);
    return report;
  }

  async commit(
    organizationId: string,
    csv: string,
    actor: ActorContext,
  ): Promise<ImportResult> {
    const { report, plan } = await this.validate(organizationId, csv);
    if (report.errors.length > 0) {
      // AC5: structured errors. The whole report goes back to the
      // operator as a 400 payload — they fix the source CSV once.
      throw new BadRequestException({
        error: 'bad_request',
        message: `${report.errors.length} row(s) failed validation`,
        report,
      });
    }
    // AC6: single transaction wrapping every row.
    const employees: ImportResult['employees'] = [];
    await withOrgScope(this.prisma, organizationId, async (tx) => {
      // emailToEmployeeId maps both pre-existing and just-created
      // employees so an in-CSV manager_email can resolve to the
      // employee row created earlier in this same tx.
      const emailToEmployeeId = new Map<string, string>(plan.existingEmailToEmployeeId);
      for (const row of plan.rows) {
        let managerEmployeeId: string | null = null;
        if (row.managerEmail) {
          managerEmployeeId = emailToEmployeeId.get(row.managerEmail) ?? null;
          if (!managerEmployeeId) {
            // This branch is unreachable on a validated plan, but
            // defense-in-depth: a refactor that loses the validation
            // ordering must not silently drop the manager link.
            throw new Error(
              `internal: manager_email ${row.managerEmail} did not resolve at commit time`,
            );
          }
        }
        let user;
        try {
          user = await tx.user.create({
            data: {
              organizationId,
              email: row.email,
              displayName: row.displayName,
            },
          });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            // Email collision against an existing user OR a duplicate
            // within the CSV that slipped past validation. Roll back
            // the entire batch — AC6.
            throw new BadRequestException({
              error: 'bad_request',
              message: `Row ${row.rowNumber}: email ${row.email} already exists`,
              report,
            });
          }
          throw err;
        }
        const employee = await tx.employee.create({
          data: {
            organizationId,
            userId: user.id,
            careerTrackId: row.careerTrackId,
            levelId: row.levelId,
            assignedAt: row.careerTrackId !== null || row.levelId !== null ? new Date() : null,
          },
        });
        // Always create an EMPLOYEE assignment so the manager-graph
        // query (Epic 7+) has a row to JOIN from. managerEmployeeId
        // is null when manager_email was omitted.
        await tx.employeeAssignment.create({
          data: {
            organizationId,
            employeeId: employee.id,
            role: 'EMPLOYEE',
            managerEmployeeId,
            assignedAt: new Date(),
          },
        });
        // Story 6-5 AC3: emit `employee.imported` per row inside the
        // SAME tx that wrote the rows. Rollback drops both.
        await tx.outboxEvent.create({
          data: {
            eventId: randomUUID(),
            organizationId,
            aggregateType: 'employee',
            aggregateId: employee.id,
            eventType: 'employee.imported',
            payload: {
              actorId: actor.user_id,
              reason: null,
              before: null,
              after: {
                userId: user.id,
                email: row.email,
                displayName: row.displayName,
                careerTrackId: row.careerTrackId,
                levelId: row.levelId,
                managerEmployeeId,
              },
            },
          },
        });
        emailToEmployeeId.set(row.email, employee.id);
        employees.push({
          row: row.rowNumber,
          employeeId: employee.id,
          userId: user.id,
          email: row.email,
        });
      }
    });
    this.logger.log(
      { op: 'import.commit', organizationId, actorId: actor.user_id, count: employees.length },
      'CSV employee import committed',
    );
    return {
      totalRows: report.totalRows,
      importedCount: employees.length,
      employees,
    };
  }

  /** Shared validation: parse CSV → look up configuration → produce
   *  both the operator-facing report and the commit-ready plan. */
  private async validate(
    organizationId: string,
    csv: string,
  ): Promise<{ report: ImportReport; plan: CommitPlan }> {
    if (typeof csv !== 'string' || csv.trim().length === 0) {
      // The operator-facing report calls out the missing body as the
      // first error so a UI can render the report uniformly.
      const report: ImportReport = {
        totalRows: 0,
        validRows: 0,
        errors: [{ row: 0, field: 'csv', reason: 'CSV body is empty' }],
        preview: [],
      };
      return { report, plan: { rows: [], existingEmailToEmployeeId: new Map() } };
    }
    let rawRows: string[][];
    try {
      rawRows = parseCsv(csv);
    } catch (err) {
      const reason = err instanceof CsvParseError ? err.message : (err as Error).message;
      const line = err instanceof CsvParseError ? err.line : 0;
      const report: ImportReport = {
        totalRows: 0,
        validRows: 0,
        errors: [{ row: line, field: 'csv', reason }],
        preview: [],
      };
      return { report, plan: { rows: [], existingEmailToEmployeeId: new Map() } };
    }
    if (rawRows.length === 0) {
      const report: ImportReport = {
        totalRows: 0,
        validRows: 0,
        errors: [{ row: 0, field: 'csv', reason: 'CSV has no rows' }],
        preview: [],
      };
      return { report, plan: { rows: [], existingEmailToEmployeeId: new Map() } };
    }
    const headerErrors = validateHeader(rawRows[0]!);
    if (headerErrors.length > 0) {
      const report: ImportReport = {
        totalRows: 0,
        validRows: 0,
        errors: headerErrors,
        preview: [],
      };
      return { report, plan: { rows: [], existingEmailToEmployeeId: new Map() } };
    }
    const dataRows = rawRows.slice(1);
    if (dataRows.length === 0) {
      const report: ImportReport = {
        totalRows: 0,
        validRows: 0,
        errors: [{ row: 0, field: 'csv', reason: 'CSV contains a header but no data rows' }],
        preview: [],
      };
      return { report, plan: { rows: [], existingEmailToEmployeeId: new Map() } };
    }
    // Look up configuration + existing users/employees ONCE. Even a
    // 1000-row CSV reads three tables at most.
    const [tracks, levels, existingUsers, existingEmployees] = await Promise.all([
      withOrgScope(this.prisma, organizationId, (tx) =>
        tx.careerTrack.findMany({ select: { id: true, slug: true } }),
      ),
      withOrgScope(this.prisma, organizationId, (tx) =>
        tx.level.findMany({ select: { id: true, levelCode: true, careerTrackId: true } }),
      ),
      withOrgScope(this.prisma, organizationId, (tx) =>
        tx.user.findMany({ select: { id: true, email: true } }),
      ),
      withOrgScope(this.prisma, organizationId, (tx) =>
        tx.employee.findMany({ select: { id: true, userId: true } }),
      ),
    ]);
    const trackBySlug = new Map(tracks.map((t) => [t.slug, t.id]));
    // (trackId, levelCode) → levelId. PRD §8.2: levelCode is unique
    // within a track but the same code (L1, L2, ...) is used across
    // tracks, so we MUST key on (track, code) to disambiguate.
    const levelByTrackAndCode = new Map<string, string>();
    for (const lvl of levels) {
      levelByTrackAndCode.set(`${lvl.careerTrackId}:${lvl.levelCode}`, lvl.id);
    }
    const userIdToEmail = new Map(existingUsers.map((u) => [u.id, u.email.toLowerCase()]));
    const existingEmailToEmployeeId = new Map<string, string>();
    for (const emp of existingEmployees) {
      const email = userIdToEmail.get(emp.userId);
      if (email) existingEmailToEmployeeId.set(email, emp.id);
    }
    const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

    // Per-row validation. We collect ALL errors before bailing so the
    // operator gets a complete report rather than a one-error-at-a-time
    // back-and-forth.
    const errors: ImportRowError[] = [];
    const preview: ImportRowPreview[] = [];
    const planRows: PlanRow[] = [];
    const seenInBatch = new Set<string>();

    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2; // header is row 1
      const rawRow = dataRows[i]!;
      if (rawRow.length !== REQUIRED_HEADERS.length) {
        errors.push({
          row: rowNumber,
          field: 'csv',
          reason: `expected ${REQUIRED_HEADERS.length} cells, got ${rawRow.length}`,
        });
        continue;
      }
      const parsed = normalizeRow(rowNumber, rawRow);
      let rowOk = true;
      // email — required, must match shape, must be unique in the CSV
      // and in the org.
      if (!parsed.email || !EMAIL_RE.test(parsed.email)) {
        errors.push({ row: rowNumber, field: 'email', reason: 'invalid email format' });
        rowOk = false;
      } else if (existingEmails.has(parsed.email)) {
        errors.push({
          row: rowNumber,
          field: 'email',
          reason: `email ${parsed.email} already exists in this organization`,
        });
        rowOk = false;
      } else if (seenInBatch.has(parsed.email)) {
        errors.push({
          row: rowNumber,
          field: 'email',
          reason: `duplicate email ${parsed.email} in CSV`,
        });
        rowOk = false;
      }
      // display_name — required, non-empty after trim.
      if (!parsed.displayName) {
        errors.push({ row: rowNumber, field: 'display_name', reason: 'display_name is required' });
        rowOk = false;
      }
      // track_slug — optional. If present, must resolve.
      let careerTrackId: string | null = null;
      if (parsed.trackSlug) {
        careerTrackId = trackBySlug.get(parsed.trackSlug) ?? null;
        if (!careerTrackId) {
          errors.push({
            row: rowNumber,
            field: 'track_slug',
            reason: `unknown track slug "${parsed.trackSlug}"`,
          });
          rowOk = false;
        }
      }
      // level_code — optional, but requires track_slug. Resolved against
      // (trackId, levelCode) so the same code under a different track
      // doesn't accidentally match. Note: if track_slug was provided
      // but did NOT resolve, we skip the level error entirely — the
      // operator already has one error for the bad track, and adding
      // a chained "level requires track" is misleading noise.
      let levelId: string | null = null;
      if (parsed.levelCode) {
        if (!parsed.trackSlug) {
          // Track was OMITTED — a real "you need to specify a track" error.
          errors.push({
            row: rowNumber,
            field: 'level_code',
            reason: 'level_code requires a track_slug',
          });
          rowOk = false;
        } else if (careerTrackId) {
          // Track was provided AND resolved; look up the level.
          levelId = levelByTrackAndCode.get(`${careerTrackId}:${parsed.levelCode}`) ?? null;
          if (!levelId) {
            errors.push({
              row: rowNumber,
              field: 'level_code',
              reason: `level_code "${parsed.levelCode}" does not exist on track "${parsed.trackSlug}"`,
            });
            rowOk = false;
          }
        }
        // else: track was provided but did NOT resolve. The track_slug
        // branch above already flagged that; suppress the chained
        // level error.
      }
      // manager_email — optional. AC4: if provided, must resolve to an
      // existing employee OR a row earlier in THIS CSV.
      let managerSource: 'existing' | 'in_batch' | null = null;
      if (parsed.managerEmail) {
        if (parsed.managerEmail === parsed.email) {
          errors.push({
            row: rowNumber,
            field: 'manager_email',
            reason: 'employee cannot be their own manager',
          });
          rowOk = false;
        } else if (existingEmailToEmployeeId.has(parsed.managerEmail)) {
          managerSource = 'existing';
        } else if (seenInBatch.has(parsed.managerEmail)) {
          managerSource = 'in_batch';
        } else {
          errors.push({
            row: rowNumber,
            field: 'manager_email',
            reason: `manager_email "${parsed.managerEmail}" does not match an existing employee or a row earlier in this CSV`,
          });
          rowOk = false;
        }
      }
      if (rowOk) {
        seenInBatch.add(parsed.email);
        planRows.push({
          rowNumber,
          email: parsed.email,
          displayName: parsed.displayName,
          careerTrackId,
          levelId,
          managerEmail: parsed.managerEmail,
        });
        preview.push({
          row: rowNumber,
          email: parsed.email,
          displayName: parsed.displayName,
          careerTrackId,
          levelId,
          managerEmail: parsed.managerEmail,
          managerSource,
        });
      }
    }

    const report: ImportReport = {
      totalRows: dataRows.length,
      validRows: planRows.length,
      errors,
      preview,
    };
    return {
      report,
      plan: { rows: planRows, existingEmailToEmployeeId },
    };
  }
}

type PlanRow = {
  rowNumber: number;
  email: string;
  displayName: string;
  careerTrackId: string | null;
  levelId: string | null;
  managerEmail: string | null;
};

type CommitPlan = {
  rows: PlanRow[];
  existingEmailToEmployeeId: Map<string, string>;
};

function validateHeader(header: string[]): ImportRowError[] {
  const errors: ImportRowError[] = [];
  if (header.length !== REQUIRED_HEADERS.length) {
    errors.push({
      row: 1,
      field: 'csv',
      reason: `expected ${REQUIRED_HEADERS.length} header columns, got ${header.length}`,
    });
    return errors;
  }
  for (let i = 0; i < REQUIRED_HEADERS.length; i++) {
    const got = (header[i] ?? '').trim().toLowerCase();
    if (got !== REQUIRED_HEADERS[i]) {
      errors.push({
        row: 1,
        field: 'csv',
        reason: `header column ${i + 1} expected "${REQUIRED_HEADERS[i]}", got "${got}"`,
      });
    }
  }
  return errors;
}

function normalizeRow(rowNumber: number, raw: string[]): ParsedRow {
  // Emails are case-insensitive (RFC 5321 §2.3.11 — the local-part is
  // technically case-sensitive but Postel's law applies; every real
  // mail system normalizes to lowercase). Slugs and codes are
  // case-sensitive at the DB layer; we trim only.
  return {
    rowNumber,
    email: (raw[0] ?? '').trim().toLowerCase(),
    displayName: (raw[1] ?? '').trim(),
    trackSlug: nullIfEmpty((raw[2] ?? '').trim()),
    levelCode: nullIfEmpty((raw[3] ?? '').trim()),
    managerEmail: nullIfEmpty((raw[4] ?? '').trim().toLowerCase()),
  };
}

function nullIfEmpty(s: string): string | null {
  return s.length === 0 ? null : s;
}
