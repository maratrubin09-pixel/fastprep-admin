import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

@Controller()
export class HealthController {
  @Public()
  @Get('/')
  root() {
    return {
      name: 'FastPrep Admin API',
      version: '0.1.0',
      status: 'running',
      endpoints: {
        health: '/api/health',
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('/health')
  health() {
    return { ok: true, timestamp: new Date().toISOString() };
  }
}





