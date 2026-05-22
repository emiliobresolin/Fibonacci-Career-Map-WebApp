import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { SessionStoreService } from '../sessions/session-store.service.js';
import { ROLES_KEY } from './roles.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import type { RequestUser, Role } from './auth.types.js';
import { JwtService } from './jwt.service.js';

/**
 * Global Layer-1 AuthGuard (Story 2-4, Arch §10.3 Layer 1).
 *
 * Three responsibilities, executed in order:
 *
 *   1. `@Public()` short-circuit — health probes, /metrics, OIDC dance.
 *   2. Bearer-token verification via JwtService → populates `request.user`
 *      with `{ user_id, organization_id, role, jti? }`. A revoked session
 *      (Story 2-3) is rejected here, BEFORE any controller code runs.
 *   3. `@Roles(...)` match — if the handler (or its class) declares a
 *      role allow-list, the actor's role must be in it. No annotation
 *      means "authenticated-only" (any role passes).
 *
 * Wired as a global APP_GUARD provider in AuthModule so it covers every
 * route by default. The `@Public()` decorator is the explicit opt-out;
 * forgetting it on a new route fails closed (401) — that's the inversion
 * this story locks in.
 *
 * The guard does NOT touch the request body, query string, or perform
 * any DB query beyond the session-revocation check that already runs on
 * every authenticated request. Keeping it pure means it can run as the
 * very first middleware on every endpoint without measurable overhead.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(SessionStoreService) private readonly sessions: SessionStoreService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // HTTP transport only. The AuthGuard does not apply to BullMQ workers,
    // RPC handlers, or any future non-HTTP transport — those have their
    // own actor-context primitives.
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['authorization'];
    // RFC 6750 §2.1 — the Bearer scheme is case-insensitive. Accept any
    // casing so SDKs that send `bearer ...` are not 401'd unexpectedly.
    if (
      !header ||
      typeof header !== 'string' ||
      header.length < 7 ||
      header.slice(0, 7).toLowerCase() !== 'bearer '
    ) {
      throw new UnauthorizedException({
        error: 'unauthorized',
        message: 'Missing bearer token',
      });
    }
    const token = header.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException({
        error: 'unauthorized',
        message: 'Empty bearer token',
      });
    }

    let payload;
    try {
      payload = await this.jwt.verifyAccess(token);
    } catch {
      // JwtService already throws UnauthorizedException with its own
      // message; re-shape to the structured-error contract for parity
      // with the missing-token branch.
      throw new UnauthorizedException({
        error: 'unauthorized',
        message: 'Invalid or expired access token',
      });
    }

    // Forced-logout enforcement (Story 2-3 AC2). Tokens minted before the
    // session-store rollout don't carry a jti — we let those through
    // during the transition; new tokens always carry one. Same shape as
    // the inline check that audit/sessions controllers previously did.
    if (payload.jti) {
      const active = await this.sessions.isActive({
        organizationId: payload.org,
        userId: payload.sub,
        jti: payload.jti,
      });
      if (!active) {
        throw new UnauthorizedException({
          error: 'unauthorized',
          message: 'Session revoked',
        });
      }
    }

    const user: RequestUser = {
      user_id: payload.sub,
      organization_id: payload.org,
      role: payload.role,
      // OIDC `name` claim minted at login (Story 2-5). Empty-string fallback
      // for legacy tokens that pre-date the claim — better than `undefined`
      // since downstream consumers (ActorContext / audit attribution) are
      // statically typed `string`. The next refresh re-mints with the
      // populated name.
      display_name: typeof payload.name === 'string' ? payload.name : '',
      ...(payload.jti ? { jti: payload.jti } : {}),
    };
    // Attach to the request so controllers + the future ActorContext
    // primitive (Story 2-5) read a single source of truth.
    (req as Request & { user?: RequestUser }).user = user;

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed && allowed.length > 0 && !allowed.includes(user.role)) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: `Role ${user.role} is not permitted for this resource`,
        requiredRoles: allowed,
      });
    }
    return true;
  }
}
