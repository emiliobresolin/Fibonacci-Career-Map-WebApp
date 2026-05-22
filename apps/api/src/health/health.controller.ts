import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/public.decorator.js';

@Controller('healthz')
@Public()
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
