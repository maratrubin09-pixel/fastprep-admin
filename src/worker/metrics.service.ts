import { Injectable } from '@nestjs/common';
import { Registry, Counter, Histogram } from 'prom-client';

@Injectable()
export class MetricsService {
  public readonly register: Registry;
  public readonly outboxProcessedTotal: Counter;
  public readonly adapterLatencySeconds: Histogram;

  constructor() {
    this.register = new Registry();

    this.outboxProcessedTotal = new Counter({
      name: 'outbox_processed_total',
      help: 'Total outbox messages processed',
      labelNames: ['status'], // done, failed, retry
      registers: [this.register],
    });

    this.adapterLatencySeconds = new Histogram({
      name: 'adapter_latency_seconds',
      help: 'TG Adapter request latency in seconds',
      buckets: [0.1, 0.5, 1, 2, 5],
      registers: [this.register],
    });
  }
}

