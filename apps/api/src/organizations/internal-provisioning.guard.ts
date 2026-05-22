import { timingSafeEqual } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { Env } from '../common/env.config.js';

/**
 * Story 6-1 AC2 — privileged internal authentication.
 *
 * The org-provisioning endpoint is called by bootstrap tooling, NOT by
 * any tenant Admin (the very first tenant doesn't exist yet at call
 * time, so the role-based JWT system has no usable identity). We gate
 * it on a shared secret passed in `X-Internal-Token`, compared to the
 * env-configured `INTERNAL_PROVISIONING_TOKEN`.
 *
 * Closed-fail semantics:
 *   • Token unset in env  → every request 401 (matches the closed-by-
 *     default contract the auth-guard locked in for Story 2-4).
 *   • Token wrong / missing header → 401.
 *   • Comparison is constant-time (timingSafeEqual on equal-length
 *     buffers) so the wall-clock response time does NOT leak the
 *     length or prefix of the secret.
 *
 * The endpoint also carries `@Public()` so the global JwtAuthGuard
 * short-circuits — both guards run; both must pass.
 */
@Injectable()
export class InternalProvisioningGuard implements CanActivate {
  private readonly logger = new Logger(InternalProvisioningGuard.name);

  constructor(
    @Optional() @Inject(ConfigService) private readonly config?: ConfigService<Env, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      // Non-HTTP transport (BullMQ worker, RPC) does not reach this
      // guard via the normal request lifecycle. Surface as 401 if it
      // ever does so a misconfigured pipeline fails closed.
      throw new UnauthorizedException({
        error: 'unauthorized',
        message: 'Internal provisioning gate not applicable here',
      });
    }
    const expected = this.config?.get('INTERNAL_PROVISIONING_TOKEN', { infer: true });
    if (!expected || typeof expected !== 'string') {
      // Closed-fail: no token configured → endpoint is disabled.
      // Don't tell the caller WHY — same 401 as a wrong token.
      this.logger.warn(
        'POST /v1/organizations was called but INTERNAL_PROVISIONING_TOKEN is not configured; rejecting',
      );
      throw new UnauthorizedException({
        error: 'unauthorized',
        message: 'Internal provisioning is not enabled on this deployment',
      });
    }
    const req = context.switchToHttp().getRequest<Request>();
    const raw = req.headers['x-internal-token'];
    const presented = Array.isArray(raw) ? raw[0] : raw;
    if (!presented || typeof presented !== 'string') {
      throw new UnauthorizedException({
        error: 'unauthorized',
        message: 'Missing X-Internal-Token header',
      });
    }
    // timingSafeEqual requires equal-length buffers — pad short inputs
    // up to the expected length so the comparison still runs in
    // constant time regardless of presented-length mismatch.
    const a = Buffer.from(presented, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    let match = false;
    if (a.length === b.length) {
      match = timingSafeEqual(a, b);
    } else {
      // Run a no-op compare against `b` so the path that finds an
      // unequal length doesn't return measurably faster than the
      // equal-length wrong-token path.
      timingSafeEqual(b, b);
      match = false;
    }
    if (!match) {
      throw new UnauthorizedException({
        error: 'unauthorized',
        message: 'Invalid X-Internal-Token',
      });
    }
    return true;
  }
}
