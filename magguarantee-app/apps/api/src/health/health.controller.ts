import { Controller, Get } from '@nestjs/common';

import { Public } from '../modules/auth/decorators/public.decorator';

export interface HealthResponse {
  status: 'ok';
  uptime: number;
  timestamp: string;
}

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  get(): HealthResponse {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
