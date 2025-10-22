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
   */
  async createOutgoingMessage(
    threadId: string,
    senderId: string,
    text: string,
    objectKey?: string
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const msgRes = await client.query(
        `INSERT INTO messages (conversation_id, sender_id, direction, text, object_key, delivery_status, created_at)
         VALUES ($1, $2, 'out', $3, $4, 'queued', NOW())
         RETURNING id`,
        [threadId, senderId, text, objectKey]
      );
      const messageId = msgRes.rows[0].id;

      await client.query(
        `INSERT INTO outbox (message_id, status, scheduled_at, attempts, created_at)
         VALUES ($1, 'pending', NOW(), 0, NOW())`,
        [messageId]
      );

      // audit_log (с EP-snapshot — упрощённо)
      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, created_at)
         VALUES ($1, 'message.send', 'message', $2, $3, NOW())`,
        [senderId, messageId, JSON.stringify({ threadId, text: text.substring(0, 50) })]
      );

      await client.query('COMMIT');
      return messageId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

