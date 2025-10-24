import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
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

  @Get('/health')
  health() {
    return { ok: true, timestamp: new Date().toISOString() };
  }
}



