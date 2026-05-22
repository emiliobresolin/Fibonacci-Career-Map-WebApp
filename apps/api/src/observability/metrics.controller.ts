import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator.js';
import { MetricsBasicAuthGuard } from './metrics-basic-auth.guard.js';
import { MetricsService } from './metrics.service.js';

// /metrics is scraped by Prometheus over basic-auth (Story 1-7). It MUST
// stay outside the JWT AuthGuard's allow-list — Prometheus is not an
// FCM user. @Public() opts out of the JWT guard; the basic-auth guard
// remains in force.
@Controller('metrics')
@Public()
@UseGuards(MetricsBasicAuthGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(@Res() res: Response): Promise<void> {
    const snap = await this.metrics.snapshot();
    res.setHeader('Content-Type', snap.contentType);
    res.send(snap.body);
  }
}
