import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';

import { Public } from '../auth/public.decorator.js';
import { HealthService } from './health.service.js';

@Controller('readyz')
@Public()
export class ReadinessController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(): Promise<{ ready: true; checks: ReturnType<HealthService['check']> extends Promise<infer R> ? R extends { checks: infer C } ? C : never : never }> {
    const report = await this.health.check();
    if (!report.ready) {
      // Structured 503 body names every failing dependency so operators can
      // skip the guesswork. Status code 503 because /readyz is K8s's signal
      // that this pod should be pulled from the service backend until the
      // dependency recovers.
      throw new HttpException(
        {
          ready: false,
          checks: report.checks,
          failing: report.checks.filter((c) => c.status === 'down').map((c) => c.name),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { ready: true, checks: report.checks } as never;
  }
}
