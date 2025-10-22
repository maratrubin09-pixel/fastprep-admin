import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { MetricsService } from './metrics.service';
import { AlertsService } from './alerts.service';

@Module({
  providers: [WorkerService, MetricsService, AlertsService],
})
export class WorkerModule {}

