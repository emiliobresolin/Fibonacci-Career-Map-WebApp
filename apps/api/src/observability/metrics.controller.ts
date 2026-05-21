import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { MetricsBasicAuthGuard } from './metrics-basic-auth.guard.js';
import { MetricsService } from './metrics.service.js';

@Controller('metrics')
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
