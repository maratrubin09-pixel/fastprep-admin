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
exports.InboxService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const ioredis_1 = __importDefault(require("ioredis"));
const db_module_1 = require("../db/db.module");
const redis_module_1 = require("../redis/redis.module");
let InboxService = class InboxService {
    pool;
    redis;
    constructor(pool, redis) {
        this.pool = pool;
        this.redis = redis;
    }
    /**
     * Проверка назначения треда: O(1) через Redis
     * Ключ: inbox:assignee:{threadId} → userId
     */
    async getThreadAssignee(threadId) {
        const key = `inbox:assignee:${threadId}`;
        return this.redis.get(key);
    }
    /**
     * Проверка, что тред в unassigned
     */
    async isThreadUnassigned(threadId) {
        const key = 'inbox:unassigned';
        const result = await this.redis.sismember(key, threadId);
        return result === 1;
    }
    /**
     * Назначение треда агенту
     */
    async assignThread(threadId, userId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`UPDATE conversations SET assignee_id = $1, updated_at = NOW() WHERE id = $2`, [userId, threadId]);
            await client.query('COMMIT');
            // Redis: SET inbox:assignee:{threadId} userId + SREM inbox:unassigned {threadId}
            await this.redis.set(`inbox:assignee:${threadId}`, userId);
            await this.redis.srem('inbox:unassigned', threadId);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Снятие назначения
     */
    async unassignThread(threadId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`UPDATE conversations SET assignee_id = NULL, updated_at = NOW() WHERE id = $1`, [threadId]);
            await client.query('COMMIT');
            // Redis: DEL inbox:assignee:{threadId} + SADD inbox:unassigned {threadId}
            await this.redis.del(`inbox:assignee:${threadId}`);
            await this.redis.sadd('inbox:unassigned', threadId);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Создание исходящего сообщения: INSERT messages + INSERT outbox (транзакционно)
     */
    async createOutgoingMessage(threadId, senderId, text, objectKey) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const msgRes = await client.query(`INSERT INTO messages (conversation_id, sender_id, direction, text, object_key, delivery_status, created_at)
         VALUES ($1, $2, 'out', $3, $4, 'queued', NOW())
         RETURNING id`, [threadId, senderId, text, objectKey]);
            const messageId = msgRes.rows[0].id;
            await client.query(`INSERT INTO outbox (message_id, status, scheduled_at, attempts, created_at)
         VALUES ($1, 'pending', NOW(), 0, NOW())`, [messageId]);
            // audit_log (с EP-snapshot — упрощённо)
            await client.query(`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, created_at)
         VALUES ($1, 'message.send', 'message', $2, $3, NOW())`, [senderId, messageId, JSON.stringify({ threadId, text: text.substring(0, 50) })]);
            await client.query('COMMIT');
            return messageId;
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
};
exports.InboxService = InboxService;
exports.InboxService = InboxService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(db_module_1.PG_POOL)),
    __param(1, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [pg_1.Pool,
        ioredis_1.default])
], InboxService);
//# sourceMappingURL=inbox.service.js.map