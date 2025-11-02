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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const db_module_1 = require("../db/db.module");
const metrics_service_1 = require("./metrics.service");
const alerts_service_1 = require("./alerts.service");
const telegram_service_1 = require("../messengers/telegram/telegram.service");
const axios_1 = __importDefault(require("axios"));
const MAX_ATTEMPTS = Number(process.env.OUTBOX_MAX_ATTEMPTS || 5);
const BASE_BACKOFF_MS = Number(process.env.OUTBOX_BASE_BACKOFF_MS || 1000);
const MAX_BACKOFF_MS = Number(process.env.OUTBOX_MAX_BACKOFF_MS || 60000);
const BATCH_SIZE = Number(process.env.OUTBOX_BATCH_SIZE || 10);
const CONCURRENCY = Number(process.env.OUTBOX_CONCURRENCY || 5);
let WorkerService = class WorkerService {
    pool;
    metrics;
    alerts;
    telegramService;
    running = false;
    timer;
    constructor(pool, metrics, alerts, telegramService) {
        this.pool = pool;
        this.metrics = metrics;
        this.alerts = alerts;
        this.telegramService = telegramService;
    }
    async start() {
        this.running = true;
        await this.loop();
    }
    async stop() {
        this.running = false;
        if (this.timer)
            clearTimeout(this.timer);
    }
    onModuleDestroy() {
        this.stop();
    }
    async loop() {
        while (this.running) {
            try {
                await this.processBatch();
                await this.alerts.checkAndAlert();
            }
            catch (err) {
                console.error('Worker loop error:', err);
            }
            // Задержка 1 секунда (оптимизировано с 5 сек)
            await new Promise((resolve) => {
                this.timer = setTimeout(resolve, 1000);
            });
        }
    }
    async processBatch() {
        const rows = await this.leaseBatch();
        console.log(`🔍 leaseBatch() returned ${rows.length} rows`);
        if (rows.length === 0)
            return;
        // Параллельная обработка (CONCURRENCY)
        const chunks = [];
        for (let i = 0; i < rows.length; i += CONCURRENCY) {
            chunks.push(rows.slice(i, i + CONCURRENCY));
        }
        for (const chunk of chunks) {
            await Promise.all(chunk.map((r) => this.processOne(r)));
        }
    }
    /**
     * Lease пачки через CTE + FOR UPDATE SKIP LOCKED
     */
    async leaseBatch() {
        // Debug: проверим, сколько pending записей есть вообще
        const debugRes = await this.pool.query(`
      SELECT COUNT(*) as count, 
             COUNT(*) FILTER (WHERE scheduled_at <= NOW()) as ready_count,
             COUNT(*) FILTER (WHERE scheduled_at > NOW()) as future_count
      FROM outbox 
      WHERE status = 'pending'
    `);
        console.log(`📊 Pending outbox stats:`, debugRes.rows[0]);
        const sql = `
      WITH batch AS (
        SELECT id
        FROM outbox
        WHERE status = 'pending' AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox
      SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
      FROM batch
      WHERE outbox.id = batch.id
      RETURNING outbox.id, outbox.message_id, outbox.attempts
    `;
        const res = await this.pool.query(sql);
        return res.rows;
    }
    /**
     * Обработка одной записи outbox
     */
    async processOne(row) {
        const client = await this.pool.connect();
        try {
            // Получить данные сообщения
            const msgRes = await client.query(`SELECT conversation_id, text, object_key FROM messages WHERE id = $1`, [row.message_id]);
            if (msgRes.rows.length === 0) {
                // Сообщение удалено — помечаем outbox как failed
                console.error(`❌ Message ${row.message_id} not found in database`);
                await this.markFailed(client, row.id, 'Message not found');
                this.metrics.outboxProcessedTotal.inc({ status: 'failed' });
                return;
            }
            const msg = msgRes.rows[0];
            console.log(`📨 Processing message: id=${row.message_id}, conversation_id=${msg.conversation_id}, hasObjectKey=${!!msg.object_key}, objectKey=${msg.object_key || 'null'}`);
            // Определяем платформу из channel_id и получаем telegram_peer_id
            const convRes = await client.query(`SELECT channel_id, telegram_peer_id FROM conversations WHERE id = $1`, [msg.conversation_id]);
            const channelId = convRes.rows[0]?.channel_id || '';
            const telegramPeerId = convRes.rows[0]?.telegram_peer_id || null;
            const platform = channelId.split(':')[0]; // например "telegram:123" -> "telegram"
            console.log(`📤 Processing outbox ${row.id}: platform=${platform}, channelId=${channelId}, hasTelegramPeerId=${!!telegramPeerId}`);
            // Вызов соответствующего сервиса
            const start = Date.now();
            let result;
            if (platform === 'telegram') {
                console.log(`📤 Calling sendViaTelegram: channelId=${channelId}, hasObjectKey=${!!msg.object_key}, objectKey=${msg.object_key || 'null'}, hasPeerId=${!!telegramPeerId}`);
                result = await this.sendViaTelegram(channelId, msg.text, telegramPeerId, msg.object_key);
                console.log(`📤 sendViaTelegram result: success=${result.success}, error=${result.error || 'none'}`);
            }
            else {
                // Fallback to TG-Adapter for legacy
                result = await this.callTgAdapter(msg.conversation_id, msg.text, msg.object_key);
            }
            const duration = (Date.now() - start) / 1000;
            this.metrics.adapterLatencySeconds.observe(duration);
            if (result.success) {
                // Успех: outbox='done', messages.delivery_status='sent'
                console.log(`✅ Message sent successfully: outbox=${row.id}, externalId=${result.externalMessageId}`);
                await client.query('BEGIN');
                await client.query(`UPDATE outbox SET status = 'done', updated_at = NOW() WHERE id = $1`, [row.id]);
                await client.query(`UPDATE messages SET delivery_status = 'sent', external_message_id = $1, updated_at = NOW() WHERE id = $2`, [result.externalMessageId, row.message_id]);
                await client.query('COMMIT');
                this.metrics.outboxProcessedTotal.inc({ status: 'done' });
                // Уведомляем API об обновлении статуса через WebSocket
                await this.notifyMessageStatusUpdate(msg.conversation_id, row.message_id, 'sent');
            }
            else {
                // Ошибка: retry или failed
                const errorMsg = result.error || 'Unknown error';
                console.error(`❌ Failed to send message: outbox=${row.id}, attempts=${row.attempts}, error=${errorMsg}`);
                if (row.attempts >= MAX_ATTEMPTS) {
                    await this.markFailed(client, row.id, errorMsg);
                    this.metrics.outboxProcessedTotal.inc({ status: 'failed' });
                    console.error(`❌ Outbox ${row.id} marked as FAILED after ${row.attempts} attempts`);
                }
                else {
                    await this.markRetry(client, row.id, row.attempts, errorMsg);
                    this.metrics.outboxProcessedTotal.inc({ status: 'retry' });
                    console.log(`🔄 Outbox ${row.id} will retry (attempt ${row.attempts + 1}/${MAX_ATTEMPTS})`);
                }
            }
        }
        catch (err) {
            console.error(`Worker error for outbox ${row.id}:`, err);
            // Retry
            if (row.attempts >= MAX_ATTEMPTS) {
                await this.markFailed(client, row.id, err.message);
                this.metrics.outboxProcessedTotal.inc({ status: 'failed' });
            }
            else {
                await this.markRetry(client, row.id, row.attempts, err.message);
                this.metrics.outboxProcessedTotal.inc({ status: 'retry' });
            }
        }
        finally {
            client.release();
        }
    }
    /**
     * Send via Telegram TDLib
     */
    async sendViaTelegram(channelId, text, telegramPeerId, objectKey) {
        try {
            // Extract chat ID from channel_id format: "telegram:12345"
            const chatId = channelId.split(':')[1];
            if (!chatId) {
                return { success: false, error: 'Invalid channel_id format' };
            }
            // Если есть вложение, отправляем с файлом
            if (objectKey) {
                const result = await this.telegramService.sendMessageWithFile(chatId, text, objectKey, telegramPeerId);
                return {
                    success: true,
                    externalMessageId: String(result.id),
                };
            }
            else {
                // Обычная текстовая отправка
                const result = await this.telegramService.sendMessage(chatId, text, telegramPeerId);
                return {
                    success: true,
                    externalMessageId: String(result.id),
                };
            }
        }
        catch (error) {
            return {
                success: false,
                error: error.message || 'Telegram send failed',
            };
        }
    }
    /**
     * Вызов TG-Adapter: POST {TG_ADAPTER_URL}/api/send
     */
    async callTgAdapter(conversationId, text, objectKey) {
        const url = process.env.TG_ADAPTER_URL;
        const token = process.env.TG_ADAPTER_TOKEN;
        if (!url || !token) {
            return { success: false, error: 'TG_ADAPTER_URL or TG_ADAPTER_TOKEN not set' };
        }
        try {
            const response = await fetch(`${url}/api/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ conversationId, text, objectKey }),
            });
            if (!response.ok) {
                const errText = await response.text();
                return { success: false, error: `HTTP ${response.status}: ${errText}` };
            }
            const data = await response.json();
            return { success: true, externalMessageId: data.messageId || 'unknown' };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    /**
     * Пометить как failed
     */
    async markFailed(client, outboxId, error) {
        await client.query(`UPDATE outbox SET status = 'failed', last_error = $1, updated_at = NOW() WHERE id = $2`, [error, outboxId]);
    }
    /**
     * Пометить как retry с backoff
     */
    async markRetry(client, outboxId, attempts, error) {
        const backoff = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempts) + Math.random() * 1000, MAX_BACKOFF_MS);
        const scheduledAt = new Date(Date.now() + backoff);
        await client.query(`UPDATE outbox SET status = 'pending', scheduled_at = $1, last_error = $2, updated_at = NOW() WHERE id = $3`, [scheduledAt, error, outboxId]);
    }
    /**
     * Уведомление API об обновлении статуса сообщения (для WebSocket broadcast)
     */
    async notifyMessageStatusUpdate(conversationId, messageId, status) {
        try {
            const backendUrl = process.env.BACKEND_URL;
            const serviceJwt = process.env.SERVICE_JWT;
            if (!backendUrl || !serviceJwt) {
                console.warn('⚠️ BACKEND_URL or SERVICE_JWT not set, skipping status update notification');
                return;
            }
            await axios_1.default.post(`${backendUrl}/api/inbox/events/message-status`, {
                conversationId,
                messageId,
                status,
            }, {
                headers: {
                    'Authorization': `Bearer ${serviceJwt}`,
                    'Content-Type': 'application/json',
                },
            });
        }
        catch (error) {
            console.error('Failed to notify message status update:', error.message);
        }
    }
};
exports.WorkerService = WorkerService;
exports.WorkerService = WorkerService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(db_module_1.PG_POOL)),
    __metadata("design:paramtypes", [pg_1.Pool,
        metrics_service_1.MetricsService,
        alerts_service_1.AlertsService,
        telegram_service_1.TelegramService])
], WorkerService);
//# sourceMappingURL=worker.service.js.map