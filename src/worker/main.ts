import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { WorkerService } from './worker.service';
import { MetricsService } from './metrics.service';
import express from 'express';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const worker = app.get(WorkerService);
  const metrics = app.get(MetricsService);

  // Запуск HTTP-сервера для /metrics
  const metricsPort = process.env.METRICS_PORT ? Number(process.env.METRICS_PORT) : 9090;
  const server = express();
  server.get('/metrics', async (req, res) => {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  });
  server.listen(metricsPort, () => {
    console.log(`Metrics server listening on :${metricsPort}`);
  });

  // Запуск воркера
  console.log('Outbox Worker starting...');
  await worker.start();
}

bootstrap();





