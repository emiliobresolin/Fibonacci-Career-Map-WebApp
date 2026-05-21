import { createHash, timingSafeEqual } from 'node:crypto';

import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { Env } from '../common/env.config.js';

// Basic-auth guard for the /metrics endpoint. Credentials come from the validated
// env (METRICS_BASIC_AUTH_USER / _PASS), which production env validation requires
// to be set. Comparison is constant-time so the endpoint cannot be timing-attacked.

@Injectable()
export class MetricsBasicAuthGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const user = this.config.get('METRICS_BASIC_AUTH_USER');
    const pass = this.config.get('METRICS_BASIC_AUTH_PASS');
    if (!user || !pass) {
      // Closed-fail: if env validation let us boot without credentials (non-prod
      // path), the /metrics endpoint is unavailable rather than open.
      throw new UnauthorizedException('Metrics endpoint not configured');
    }

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Basic ')) {
      throw new UnauthorizedException('Missing Authorization header');
    }
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep < 0) throw new UnauthorizedException('Malformed credentials');
    const reqUser = decoded.slice(0, sep);
    const reqPass = decoded.slice(sep + 1);

    // Compute BOTH comparisons before combining so the total request time does
    // not differ between "bad user / pass not checked" and "good user / bad pass".
    // Short-circuiting via `||` would leak which field failed via timing.
    const userOk = constantTimeEquals(reqUser, user);
    const passOk = constantTimeEquals(reqPass, pass);
    if (!(userOk && passOk)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return true;
  }
}

// Constant-time string comparison via fixed-length sha256 digests. Hashing both
// sides means timingSafeEqual always operates on 32-byte buffers regardless of
// input length, eliminating length oracles entirely.
function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
