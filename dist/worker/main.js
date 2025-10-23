"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const worker_module_1 = require("./worker.module");
const worker_service_1 = require("./worker.service");
const metrics_service_1 = require("./metrics.service");
const express_1 = __importDefault(require("express"));
async function bootstrap() {
    const app = await core_1.NestFactory.createApplicationContext(worker_module_1.WorkerModule);
    const worker = app.get(worker_service_1.WorkerService);
    const metrics = app.get(metrics_service_1.MetricsService);
    // Запуск HTTP-сервера для /metrics
    const metricsPort = process.env.METRICS_PORT ? Number(process.env.METRICS_PORT) : 9090;
    const server = (0, express_1.default)();
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
//# sourceMappingURL=main.js.map