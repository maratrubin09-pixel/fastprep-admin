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
     * Возвращает полные данные созданного сообщения для немедленного отображения в UI
     */
    async createOutgoingMessage(threadId, senderId, text, objectKey) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            console.log(`🔍 About to insert message: threadId=${threadId}, senderId=${senderId}, textLength=${text?.length || 0}, objectKey=${objectKey || 'NULL'}`);
            const msgRes = await client.query(`INSERT INTO messages (conversation_id, sender_id, direction, text, object_key, delivery_status, created_at, updated_at)
         VALUES ($1, $2, 'out', $3, $4, 'queued', NOW(), NOW())
         RETURNING *`, [threadId, senderId, text || '', objectKey || null]);
            const message = msgRes.rows[0];
            console.log(`✅ Message created: id=${message.id}, threadId=${threadId}, hasObjectKey=${!!message.object_key}, objectKey=${message.object_key || 'null'}, textLength=${message.text?.length || 0}`);
            const outboxRes = await client.query(`INSERT INTO outbox (message_id, conversation_id, status, scheduled_at, attempts, created_at)
         VALUES ($1, $2, 'pending', NOW(), 0, NOW())
         RETURNING *`, [message.id, threadId]);
            console.log(`✅ Outbox entry created: message_id=${message.id}, conversation_id=${threadId}, outbox_id=${outboxRes.rows[0].id}`);
            // audit_log (с EP-snapshot — упрощённо)
            await client.query(`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, created_at)
         VALUES ($1, 'message.send', 'message', $2, $3, NOW())`, [senderId, message.id, JSON.stringify({ threadId, text: text ? text.substring(0, 50) : '' })]);
            // Update conversation's last_message_at
            await client.query(`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`, [threadId]);
            await client.query('COMMIT');
            console.log(`✅ Transaction committed successfully for message ${message.id}`);
            return message;
        }
        catch (err) {
            await client.query('ROLLBACK');
            console.error(`❌ Transaction rolled back for message creation:`, err);
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Find or create conversation thread by channel_id
     * Also searches by external_chat_id, sender_phone, and telegram_peer_id to find deleted conversations
     */
    async findOrCreateThread(params) {
        const client = await this.pool.connect();
        try {
            // Try to find existing thread by channel_id (including deleted ones)
            let existingThread = await client.query(`SELECT * FROM conversations WHERE channel_id = $1`, [params.channel_id]);
            // If not found, try to find by other identifiers (even if deleted)
            if (existingThread.rows.length === 0) {
                const searchConditions = [];
                const searchValues = [];
                let paramIndex = 1;
                if (params.external_chat_id) {
                    searchConditions.push(`external_chat_id = $${paramIndex++}`);
                    searchValues.push(params.external_chat_id);
                }
                if (params.sender_phone) {
                    searchConditions.push(`sender_phone = $${paramIndex++}`);
                    searchValues.push(params.sender_phone);
                }
                if (params.telegram_peer_id) {
                    searchConditions.push(`telegram_peer_id = $${paramIndex++}`);
                    searchValues.push(params.telegram_peer_id);
                }
                if (searchConditions.length > 0) {
                    const searchQuery = `
            SELECT * FROM conversations 
            WHERE (${searchConditions.join(' OR ')})
            ORDER BY deleted_at NULLS FIRST, created_at DESC
            LIMIT 1
          `;
                    existingThread = await client.query(searchQuery, searchValues);
                }
            }
            if (existingThread.rows.length > 0) {
                const foundThread = existingThread.rows[0];
                const isDeleted = foundThread.deleted_at !== null;
                // If thread was deleted, restore it
                if (isDeleted) {
                    await client.query(`UPDATE conversations SET deleted_at = NULL, updated_at = NOW() WHERE id = $1`, [foundThread.id]);
                    // Re-add to Redis unassigned set if it was removed
                    await this.redis.sadd('inbox:unassigned', foundThread.id);
                }
                // Update chat info if provided (обновляем только если новое значение не null)
                const updates = [];
                const values = [];
                let paramIndex = 1;
                // Update channel_id if it changed (for restored conversations)
                if (foundThread.channel_id !== params.channel_id) {
                    updates.push(`channel_id = $${paramIndex++}`);
                    values.push(params.channel_id);
                }
                if (params.chat_title !== undefined) {
                    // Обновляем chat_title если:
                    // 1. Новое значение не null И не "Unknown" (всегда обновляем лучшее значение)
                    // 2. Старое было "Unknown", а новое что-то другое
                    // 3. Новое значение содержит больше информации (не начинается с "@" или "Chat")
                    const currentTitle = foundThread.chat_title;
                    const newTitle = params.chat_title;
                    // Определяем приоритет имен
                    const getTitlePriority = (title) => {
                        if (!title || title === 'Unknown')
                            return 0;
                        if (title.startsWith('Chat ') || title.startsWith('@'))
                            return 1; // Низкий приоритет (fallback)
                        if (title.includes('+') && /^\+?[0-9]+$/.test(title.replace(/\s/g, '')))
                            return 2; // Телефон
                        return 3; // Полное имя - высокий приоритет
                    };
                    const shouldUpdate = (newTitle && newTitle !== 'Unknown' && getTitlePriority(newTitle) > getTitlePriority(currentTitle)) ||
                        (currentTitle === 'Unknown' && newTitle && newTitle !== 'Unknown') ||
                        (newTitle && !newTitle.startsWith('@') && !newTitle.startsWith('Chat ') && currentTitle && (currentTitle.startsWith('@') || currentTitle.startsWith('Chat ')));
                    if (shouldUpdate || params.chat_title === null) {
                        updates.push(`chat_title = $${paramIndex++}`);
                        values.push(params.chat_title);
                    }
                }
                if (params.chat_type !== undefined) {
                    updates.push(`chat_type = COALESCE($${paramIndex++}, chat_type)`);
                    values.push(params.chat_type);
                }
                if (params.participant_count !== undefined) {
                    updates.push(`participant_count = COALESCE($${paramIndex++}, participant_count)`);
                    values.push(params.participant_count);
                }
                if (params.telegram_peer_id !== undefined) {
                    // telegram_peer_id имеет приоритет - если есть (не null), всегда обновляем
                    // Если null, не обновляем (оставляем старое значение)
                    if (params.telegram_peer_id !== null) {
                        updates.push(`telegram_peer_id = $${paramIndex++}`);
                        values.push(params.telegram_peer_id);
                    }
                }
                // Для контактных данных - обновляем только если новое значение не null
                if (params.sender_phone !== undefined && params.sender_phone !== null) {
                    updates.push(`sender_phone = $${paramIndex++}`);
                    values.push(params.sender_phone);
                }
                if (params.sender_username !== undefined && params.sender_username !== null) {
                    updates.push(`sender_username = $${paramIndex++}`);
                    values.push(params.sender_username);
                }
                if (params.sender_first_name !== undefined && params.sender_first_name !== null) {
                    updates.push(`sender_first_name = $${paramIndex++}`);
                    values.push(params.sender_first_name);
                }
                if (params.sender_last_name !== undefined && params.sender_last_name !== null) {
                    updates.push(`sender_last_name = $${paramIndex++}`);
                    values.push(params.sender_last_name);
                }
                if (updates.length > 0) {
                    values.push(foundThread.id);
                    const currentData = foundThread;
                    console.log(`🔄 Updating conversation ${foundThread.id}: ${updates.join(', ')}`);
                    console.log(`📊 Before update: chat_title="${currentData.chat_title}", telegram_peer_id=${currentData.telegram_peer_id ? 'present' : 'null'}`);
                    console.log(`📊 Update values: chat_title=${params.chat_title}, telegram_peer_id=${params.telegram_peer_id ? 'present' : 'null'}`);
                    await client.query(`UPDATE conversations 
             SET ${updates.join(', ')}, updated_at = NOW()
             WHERE id = $${paramIndex}`, values);
                    // Fetch updated thread
                    const updated = await client.query(`SELECT * FROM conversations WHERE id = $1`, [foundThread.id]);
                    console.log(`✅ Conversation ${isDeleted ? 'restored and ' : ''}updated: chat_title="${updated.rows[0].chat_title}", telegram_peer_id=${updated.rows[0].telegram_peer_id ? 'present' : 'null'}`);
                    return updated.rows[0];
                }
                const currentData = foundThread;
                console.log(`⏭️ No updates needed for conversation ${foundThread.id}`);
                console.log(`📊 Current data: chat_title="${currentData.chat_title}", telegram_peer_id=${currentData.telegram_peer_id ? 'present' : 'null'}`);
                console.log(`📊 Received params: chat_title=${params.chat_title}, telegram_peer_id=${params.telegram_peer_id ? 'present' : 'null'}`);
                return foundThread;
            }
            // Create new thread with chat info
            const result = await client.query(`INSERT INTO conversations (channel_id, external_chat_id, chat_title, chat_type, participant_count, telegram_peer_id, sender_phone, sender_username, sender_first_name, sender_last_name, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open', NOW(), NOW())
         RETURNING *`, [
                params.channel_id,
                params.external_chat_id || null,
                params.chat_title || null,
                params.chat_type || null,
                params.participant_count || null,
                params.telegram_peer_id || null,
                params.sender_phone || null,
                params.sender_username || null,
                params.sender_first_name || null,
                params.sender_last_name || null
            ]);
            const thread = result.rows[0];
            // Add to unassigned set in Redis
            await this.redis.sadd('inbox:unassigned', thread.id);
            return thread;
        }
        finally {
            client.release();
        }
    }
    /**
     * Create incoming message
     * Increments unread_count if direction is 'in'
     */
    async createMessage(params) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query(`INSERT INTO messages (conversation_id, direction, text, external_message_id, sender_name, metadata, object_key, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING *`, [
                params.conversation_id,
                params.direction,
                params.text,
                params.external_message_id || null,
                params.sender_name || null,
                params.metadata ? JSON.stringify(params.metadata) : null,
                params.object_key || null,
            ]);
            const message = result.rows[0];
            // Update thread's last_message_at and increment unread_count for incoming messages
            if (params.direction === 'in') {
                await client.query(`UPDATE conversations 
           SET last_message_at = NOW(), 
               unread_count = unread_count + 1,
               updated_at = NOW() 
           WHERE id = $1`, [params.conversation_id]);
            }
            else {
                await client.query(`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`, [params.conversation_id]);
            }
            await client.query('COMMIT');
            return message;
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
     * Mark conversation as read (reset unread_count)
     */
    async markConversationAsRead(conversationId) {
        await this.pool.query(`UPDATE conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1`, [conversationId]);
    }
    /**
     * Update message delivery status
     */
    async updateMessageStatus(externalMessageId, status) {
        await this.pool.query(`UPDATE messages SET delivery_status = $1, updated_at = NOW() 
       WHERE external_message_id = $2`, [status, externalMessageId]);
    }
    /**
     * Get all conversations ordered by last activity (excluding deleted)
     */
    async getAllConversations() {
        const result = await this.pool.query(`SELECT * FROM conversations 
       WHERE deleted_at IS NULL
       ORDER BY COALESCE(last_message_at, created_at) DESC
       LIMIT 100`);
        return result.rows;
    }
    /**
     * Get all messages for a conversation
     */
    async getMessages(conversationId) {
        const result = await this.pool.query(`SELECT * FROM messages 
       WHERE conversation_id = $1 
       ORDER BY created_at ASC`, [conversationId]);
        return result.rows;
    }
    /**
     * Soft delete conversation (mark as deleted instead of physically deleting)
     * This allows restoring conversations when new messages arrive from the same sender
     */
    async deleteConversation(conversationId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Soft delete conversation (mark as deleted)
            const result = await client.query(`UPDATE conversations 
         SET deleted_at = NOW(), updated_at = NOW() 
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id, channel_id`, [conversationId]);
            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                // Check if conversation exists but is already deleted
                const existing = await client.query(`SELECT id FROM conversations WHERE id = $1`, [conversationId]);
                if (existing.rows.length === 0) {
                    return { success: false, message: 'Conversation not found' };
                }
                else {
                    return { success: false, message: 'Conversation already deleted' };
                }
            }
            // Remove from Redis unassigned set
            await this.redis.srem('inbox:unassigned', conversationId);
            await this.redis.del(`inbox:assignee:${conversationId}`);
            await client.query('COMMIT');
            return {
                success: true,
                message: `Deleted conversation ${conversationId} (${result.rows[0].channel_id})`
            };
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