import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { PG_POOL } from '../db/db.module';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class InboxService {
  constructor(
    @Inject(PG_POOL) private pool: Pool,
    @Inject(REDIS_CLIENT) private redis: Redis
  ) {}

  /**
   * Проверка назначения треда: O(1) через Redis
   * Ключ: inbox:assignee:{threadId} → userId
   */
  async getThreadAssignee(threadId: string): Promise<string | null> {
    const key = `inbox:assignee:${threadId}`;
    return this.redis.get(key);
  }

  /**
   * Проверка, что тред в unassigned
   */
  async isThreadUnassigned(threadId: string): Promise<boolean> {
    const key = 'inbox:unassigned';
    const result = await this.redis.sismember(key, threadId);
    return result === 1;
  }

  /**
   * Назначение треда агенту
   */
  async assignThread(threadId: string, userId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE conversations SET assignee_id = $1, updated_at = NOW() WHERE id = $2`,
        [userId, threadId]
      );
      await client.query('COMMIT');

      // Redis: SET inbox:assignee:{threadId} userId + SREM inbox:unassigned {threadId}
      await this.redis.set(`inbox:assignee:${threadId}`, userId);
      await this.redis.srem('inbox:unassigned', threadId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Снятие назначения
   */
  async unassignThread(threadId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE conversations SET assignee_id = NULL, updated_at = NOW() WHERE id = $1`,
        [threadId]
      );
      await client.query('COMMIT');

      // Redis: DEL inbox:assignee:{threadId} + SADD inbox:unassigned {threadId}
      await this.redis.del(`inbox:assignee:${threadId}`);
      await this.redis.sadd('inbox:unassigned', threadId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Создание исходящего сообщения: INSERT messages + INSERT outbox (транзакционно)
   * Возвращает полные данные созданного сообщения для немедленного отображения в UI
   */
  async createOutgoingMessage(
    threadId: string,
    senderId: string,
    text: string,
    objectKey?: string
  ): Promise<any> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const msgRes = await client.query(
        `INSERT INTO messages (conversation_id, sender_id, direction, text, object_key, delivery_status, created_at, updated_at)
         VALUES ($1, $2, 'out', $3, $4, 'queued', NOW(), NOW())
         RETURNING *`,
        [threadId, senderId, text, objectKey]
      );
      const message = msgRes.rows[0];

      await client.query(
        `INSERT INTO outbox (message_id, conversation_id, status, scheduled_at, attempts, created_at)
         VALUES ($1, $2, 'pending', NOW(), 0, NOW())`,
        [message.id, threadId]
      );

      // audit_log (с EP-snapshot — упрощённо)
      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, created_at)
         VALUES ($1, 'message.send', 'message', $2, $3, NOW())`,
        [senderId, message.id, JSON.stringify({ threadId, text: text ? text.substring(0, 50) : '' })]
      );

      // Update conversation's last_message_at
      await client.query(
        `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [threadId]
      );

      await client.query('COMMIT');
      return message;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Find or create conversation thread by channel_id
   */
  async findOrCreateThread(params: {
    channel_id: string;
    external_chat_id?: string;
    platform?: string;
    chat_title?: string;
    chat_type?: string;
    participant_count?: number;
    telegram_peer_id?: string;
    sender_phone?: string;
    sender_username?: string;
    sender_first_name?: string;
    sender_last_name?: string;
  }): Promise<any> {
    const client = await this.pool.connect();
    try {
      // Try to find existing thread
      const existingThread = await client.query(
        `SELECT * FROM conversations WHERE channel_id = $1`,
        [params.channel_id]
      );

      if (existingThread.rows.length > 0) {
        // Update chat info if provided (обновляем только если новое значение не null)
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (params.chat_title !== undefined) {
          updates.push(`chat_title = COALESCE($${paramIndex++}, chat_title)`);
          values.push(params.chat_title);
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
          updates.push(`telegram_peer_id = COALESCE($${paramIndex++}, telegram_peer_id)`);
          values.push(params.telegram_peer_id);
        }
        if (params.sender_phone !== undefined) {
          updates.push(`sender_phone = COALESCE($${paramIndex++}, sender_phone)`);
          values.push(params.sender_phone);
        }
        if (params.sender_username !== undefined) {
          updates.push(`sender_username = COALESCE($${paramIndex++}, sender_username)`);
          values.push(params.sender_username);
        }
        if (params.sender_first_name !== undefined) {
          updates.push(`sender_first_name = COALESCE($${paramIndex++}, sender_first_name)`);
          values.push(params.sender_first_name);
        }
        if (params.sender_last_name !== undefined) {
          updates.push(`sender_last_name = COALESCE($${paramIndex++}, sender_last_name)`);
          values.push(params.sender_last_name);
        }

        if (updates.length > 0) {
          values.push(existingThread.rows[0].id);
          await client.query(
            `UPDATE conversations 
             SET ${updates.join(', ')}, updated_at = NOW()
             WHERE id = $${paramIndex}`,
            values
          );
          // Fetch updated thread
          const updated = await client.query(
            `SELECT * FROM conversations WHERE id = $1`,
            [existingThread.rows[0].id]
          );
          return updated.rows[0];
        }
        return existingThread.rows[0];
      }

      // Create new thread with chat info
      const result = await client.query(
        `INSERT INTO conversations (channel_id, external_chat_id, chat_title, chat_type, participant_count, telegram_peer_id, sender_phone, sender_username, sender_first_name, sender_last_name, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'open', NOW(), NOW())
         RETURNING *`,
        [
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
        ]
      );

      const thread = result.rows[0];

      // Add to unassigned set in Redis
      await this.redis.sadd('inbox:unassigned', thread.id);

      return thread;
    } finally {
      client.release();
    }
  }

  /**
   * Create incoming message
   */
  async createMessage(params: {
    conversation_id: string;
    direction: 'in' | 'out';
    text: string;
    external_message_id?: string;
    sender_name?: string;
    metadata?: any;
  }): Promise<any> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO messages (conversation_id, direction, text, external_message_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING *`,
        [params.conversation_id, params.direction, params.text, params.external_message_id || null]
      );

      const message = result.rows[0];

      // Update thread's last_message_at
      await client.query(
        `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [params.conversation_id]
      );

      await client.query('COMMIT');

      return message;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Update message delivery status
   */
  async updateMessageStatus(externalMessageId: string, status: string): Promise<void> {
    await this.pool.query(
      `UPDATE messages SET delivery_status = $1, updated_at = NOW() 
       WHERE external_message_id = $2`,
      [status, externalMessageId]
    );
  }

  /**
   * Get all conversations ordered by last activity
   */
  async getAllConversations(): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM conversations 
       ORDER BY COALESCE(last_message_at, created_at) DESC
       LIMIT 100`
    );
    return result.rows;
  }

  /**
   * Get all messages for a conversation
   */
  async getMessages(conversationId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM messages 
       WHERE conversation_id = $1 
       ORDER BY created_at ASC`,
      [conversationId]
    );
    return result.rows;
  }
}








