"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsService = void 0;
const common_1 = require("@nestjs/common");
const prom_client_1 = require("prom-client");
let MetricsService = class MetricsService {
    register;
    outboxProcessedTotal;
    adapterLatencySeconds;
    constructor() {
        this.register = new prom_client_1.Registry();
        this.outboxProcessedTotal = new prom_client_1.Counter({
            name: 'outbox_processed_total',
            help: 'Total outbox messages processed',
            labelNames: ['status'], // done, failed, retry
            registers: [this.register],
        });
        this.adapterLatencySeconds = new prom_client_1.Histogram({
            name: 'adapter_latency_seconds',
            help: 'TG Adapter request latency in seconds',
            buckets: [0.1, 0.5, 1, 2, 5],
            registers: [this.register],
        });
    }
};
exports.MetricsService = MetricsService;
exports.MetricsService = MetricsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], MetricsService);
//# sourceMappingURL=metrics.service.js.map