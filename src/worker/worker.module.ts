import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { MetricsService } from './metrics.service';
import { AlertsService } from './alerts.service';
import { DbModule } from '../db/db.module';
import { TelegramModule } from '../messengers/telegram/telegram.module';

@Module({
  imports: [DbModule, TelegramModule],
  providers: [WorkerService, MetricsService, AlertsService],
})
export class WorkerModule {}










