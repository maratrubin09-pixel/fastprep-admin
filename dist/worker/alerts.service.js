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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertsService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const db_module_1 = require("../db/db.module");
let AlertsService = class AlertsService {
    pool;
    lastAlertTime = 0;
    constructor(pool) {
        this.pool = pool;
    }
    /**
     * Проверка всплеска failed за окно времени и отправка алёрта
     */
    async checkAndAlert() {
        const threshold = Number(process.env.FAIL_ALERT_THRESHOLD || 10);
        const windowSec = Number(process.env.FAIL_ALERT_WINDOW_SEC || 300);
        const cooldownSec = Number(process.env.FAIL_ALERT_COOLDOWN_SEC || 3600);
        const now = Date.now();
        if (now - this.lastAlertTime < cooldownSec * 1000) {
            // Кулдаун активен
            return;
        }
        const sql = `
      SELECT COUNT(*) AS cnt
      FROM outbox
      WHERE status = 'failed'
        AND updated_at >= NOW() - INTERVAL '${windowSec} seconds'
    `;
        const res = await this.pool.query(sql);
        const count = Number(res.rows[0]?.cnt || 0);
        if (count >= threshold) {
            await this.sendAlert(count, windowSec);
            this.lastAlertTime = now;
        }
    }
    async sendAlert(count, windowSec) {
        const message = `🚨 Outbox Alert: ${count} failed messages in last ${windowSec}s`;
        // Slack webhook
        const slackUrl = process.env.SLACK_WEBHOOK_URL;
        if (slackUrl) {
            try {
                await fetch(slackUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: message }),
                });
                console.log('Slack alert sent');
            }
            catch (err) {
                console.error('Failed to send Slack alert:', err);
            }
        }
        // Email (упрощённо — заглушка)
        console.log('EMAIL ALERT:', message);
    }
};
exports.AlertsService = AlertsService;
exports.AlertsService = AlertsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(db_module_1.PG_POOL)),
    __metadata("design:paramtypes", [pg_1.Pool])
], AlertsService);
//# sourceMappingURL=alerts.service.js.map