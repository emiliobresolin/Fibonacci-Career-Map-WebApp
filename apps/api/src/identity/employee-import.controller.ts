import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Query,
} from '@nestjs/common';

import { ActorContext, type ActorContext as ActorContextType } from '../auth/actor-context.js';
import { Roles } from '../auth/roles.decorator.js';
import type { ImportReport, ImportResult } from './employee-import.service.js';
import { EmployeeImportService } from './employee-import.service.js';

type BulkImportDto = { csv: string };

/** Hard upper bound on the CSV size. At ~150 B/row, 2MB ≈ 13k rows —
 *  far beyond any realistic single-pass onboarding batch. The server-
 *  side JSON body limit (raised to 5MB in main.ts) is the outer
 *  defense; this is the inner defense that produces a structured 400
 *  instead of leaving the parser running for seconds on a paste-bomb.
 *  Operators with larger rosters should split the file. */
const MAX_CSV_BYTES = 2_000_000;

/**
 * Story 6-5 — POST /v1/employees/bulk-import.
 *
 * Two modes via `?dryRun=true|false`:
 *   • dryRun (true)  — validates the CSV and returns a per-row report
 *                       AND a per-row preview (AC2). No DB writes.
 *   • commit (false) — runs validation, then writes all rows in one
 *                       transaction (AC6: rollback on any failure).
 *                       Each row emits an `employee.imported` outbox
 *                       audit event (AC3).
 *
 * Role-gated to ADMIN. The PRD allows HR to import as well, but FCM's
 * role enum is EMPLOYEE/MANAGER/ADMIN (Story 2-1) — HR is conceptually
 * a sub-role of ADMIN in MVP. A future role widening lifts the gate.
 *
 * CSV body shape (header row required, exact column order):
 *   email,display_name,track_slug,level_code,manager_email
 *
 * track_slug, level_code, and manager_email are optional per row.
 * manager_email must resolve to either an existing employee or a row
 * earlier in the same CSV (AC4).
 */
@Controller('v1/employees')
export class EmployeeImportController {
  constructor(
    @Inject(EmployeeImportService) private readonly importer: EmployeeImportService,
  ) {}

  @Post('bulk-import')
  @Roles('ADMIN')
  @HttpCode(200)
  async bulkImport(
    @ActorContext() actor: ActorContextType,
    @Query('dryRun') dryRunRaw: string | undefined,
    @Body() dto: BulkImportDto,
  ): Promise<ImportReport | ImportResult> {
    if (!dto || typeof dto.csv !== 'string') {
      // The body shape is `{ csv: string }`. A missing field surfaces
      // as the same 400 the validation pipeline would otherwise raise,
      // but here we catch it pre-parse so the operator gets a clean
      // structured message.
      throw new BadRequestException({
        error: 'bad_request',
        message: 'request body must be { csv: string }',
      });
    }
    if (dto.csv.length > MAX_CSV_BYTES) {
      throw new BadRequestException({
        error: 'bad_request',
        message: `CSV body exceeds the ${MAX_CSV_BYTES}-byte limit; split into multiple imports`,
      });
    }
    const dryRun = parseDryRun(dryRunRaw);
    if (dryRun) {
      return this.importer.dryRun(actor.organization_id, dto.csv);
    }
    return this.importer.commit(actor.organization_id, dto.csv, actor);
  }
}

/** Accept any truthy form of "true" the operator might type into a
 *  query string: `?dryRun`, `?dryRun=true`, `?dryRun=1`. Anything else
 *  (including unset) means commit. */
function parseDryRun(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const v = raw.toLowerCase();
  return v === '' || v === 'true' || v === '1' || v === 'yes';
}
