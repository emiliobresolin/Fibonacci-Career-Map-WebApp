import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { BlockerKind } from '@prisma/client';

import { ActorContext, type ActorContext as ActorContextType } from '../auth/actor-context.js';
import { Roles } from '../auth/roles.decorator.js';
import { EmployeesRepository } from './employees.repository.js';
import {
  BlockerAlreadyResolvedError,
  BlockersRepository,
  isDuplicateActiveBlockerError,
  type BlockerRow,
} from './blockers.repository.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BLOCKER_KINDS: readonly BlockerKind[] = ['PIP', 'PERFORMANCE_CONCERN', 'HR_HOLD', 'OTHER'];
const REASON_MIN = 20;
const REASON_MAX = 4000;

type OpenBlockerDto = { kind: BlockerKind; reason: string };
type ResolveBlockerDto = { resolutionNote?: string | null };

/**
 * Story 6-2b Admin/HR API surface for `employee_blockers`.
 *
 * Two endpoints:
 *   POST   /v1/employees/:id/blockers   — open a new active blocker
 *   PATCH  /v1/blockers/:id/resolve     — resolve an OPEN blocker
 *
 * AC2: both are ADMIN-only. PRD §8.5 says "Admin/HR may insert or
 * resolve blockers" but FCM's role enum is EMPLOYEE/MANAGER/ADMIN
 * (Story 2-1) — HR is conceptually a sub-role of ADMIN in MVP, so
 * the role gate is just `@Roles('ADMIN')`. A future HR-role
 * carve-out can widen this without breaking the API contract.
 *
 * AC3: both endpoints emit audit events via outbox — that work
 * happens inside `BlockersRepository.open()` and `resolve()`,
 * which co-commit the outbox row with the DB write.
 */
@Controller()
export class BlockersController {
  constructor(
    @Inject(BlockersRepository) private readonly blockers: BlockersRepository,
    @Inject(EmployeesRepository) private readonly employees: EmployeesRepository,
  ) {}

  @Post('v1/employees/:employeeId/blockers')
  @Roles('ADMIN')
  @HttpCode(201)
  async open(
    @ActorContext() actor: ActorContextType,
    @Param('employeeId') employeeId: string,
    @Body() dto: OpenBlockerDto,
  ): Promise<BlockerRow> {
    if (!UUID_RE.test(employeeId)) {
      throw new BadRequestException({ error: 'bad_request', message: 'employeeId must be a UUID' });
    }
    if (!dto?.kind || !BLOCKER_KINDS.includes(dto.kind)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: `kind must be one of ${BLOCKER_KINDS.join(', ')}`,
      });
    }
    const reason = typeof dto.reason === 'string' ? dto.reason.trim() : '';
    if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
      throw new BadRequestException({
        error: 'bad_request',
        message: `reason must be between ${REASON_MIN} and ${REASON_MAX} chars`,
      });
    }
    // Confirm the employee exists in this org BEFORE attempting the
    // blocker create — without it, the FK violation would surface as
    // a generic 500 instead of a clean 404. The lookup goes through
    // EmployeesRepository so it inherits the same RLS scope.
    const employee = await this.employees.findById(actor.organization_id, employeeId);
    if (!employee) {
      throw new NotFoundException({ error: 'not_found', message: 'Unknown employee' });
    }
    try {
      return await this.blockers.open(actor.organization_id, {
        employeeId,
        kind: dto.kind,
        reason,
        openedBy: actor.user_id,
      });
    } catch (err) {
      if (isDuplicateActiveBlockerError(err)) {
        throw new ConflictException({
          error: 'conflict',
          message: `An active ${dto.kind} blocker already exists for this employee`,
        });
      }
      throw err;
    }
  }

  @Patch('v1/blockers/:id/resolve')
  @Roles('ADMIN')
  async resolve(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
    @Body() dto: ResolveBlockerDto,
  ): Promise<BlockerRow> {
    if (!UUID_RE.test(id)) {
      throw new BadRequestException({ error: 'bad_request', message: 'blocker id must be a UUID' });
    }
    let resolutionNote: string | null = null;
    if (dto?.resolutionNote !== undefined && dto.resolutionNote !== null) {
      if (typeof dto.resolutionNote !== 'string') {
        throw new BadRequestException({
          error: 'bad_request',
          message: 'resolutionNote must be a string',
        });
      }
      const trimmed = dto.resolutionNote.trim();
      if (trimmed.length > REASON_MAX) {
        throw new BadRequestException({
          error: 'bad_request',
          message: `resolutionNote must be ≤${REASON_MAX} chars`,
        });
      }
      resolutionNote = trimmed.length > 0 ? trimmed : null;
    }
    try {
      return await this.blockers.resolve(actor.organization_id, id, {
        resolvedBy: actor.user_id,
        resolutionNote,
      });
    } catch (err) {
      if (err instanceof BlockerAlreadyResolvedError) {
        // 409 covers both "already resolved" and "doesn't exist" —
        // we deliberately don't distinguish so an Admin from org A
        // can't probe whether a blocker id exists in org B.
        throw new ConflictException({
          error: 'conflict',
          message: 'Blocker is already resolved or does not exist',
        });
      }
      throw err;
    }
  }
}
