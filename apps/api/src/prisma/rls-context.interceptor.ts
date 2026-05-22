import {
  CallHandler,
  ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import type { RequestUser } from '../auth/auth.types.js';
import { RlsScope, isUuid } from './rls.helpers.js';

/**
 * RLS context interceptor (Story 2-6 AC2). Wraps every authenticated HTTP
 * handler in `RlsScope.run` so any downstream code path can read the
 * current orgId via `RlsScope.current()`. Domain services that issue
 * tenant-scoped queries then call `withOrgScope(prisma, orgId, fn)` to
 * get an RLS-policy-respecting transaction.
 *
 * Streaming-safe: the entire observable returned by `next.handle()` is
 * subscribed inside the ALS frame, so each emission (single value OR
 * multi-emit SSE / future streaming routes) inherits the scope. Wrapping
 * via `RlsScope.run(orgId, () => next.handle())` would NOT work — the
 * `next.handle()` returns an Observable that subscribes lazily; without
 * an explicit `new Observable(subscriber => ...)` wrapper, the subscribe
 * happens OUTSIDE the ALS frame.
 *
 * No-op on non-http transports (BullMQ workers etc. have their own
 * RLS-scope helper — call `withOrgScope(prisma, actor.organization_id, fn)`
 * inside the consumer).
 *
 * No-op on routes that didn't populate `req.user` — typically `@Public()`
 * endpoints (OIDC dance, health probes, /metrics). Those endpoints
 * should never query a tenant-scoped table; if they do, the closed-fail
 * RLS policy returns empty results.
 */
@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = req.user;
    if (!user || !isUuid(user.organization_id)) {
      return next.handle();
    }
    const orgId = user.organization_id;

    return new Observable<unknown>((subscriber) => {
      // Subscribe to the downstream pipeline INSIDE the ALS frame so the
      // handler body + every awaited continuation inherits RlsScope.current().
      // We forward the entire Observable (not a Promise) so multi-emit
      // streams (SSE, future @Sse() routes) keep working.
      let teardown: { unsubscribe: () => void } | null = null;
      RlsScope.run(orgId, () => {
        teardown = next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
      return () => teardown?.unsubscribe();
    });
  }
}
