import { Controller, Get, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';
import { Public } from '../auth/public.decorator';

@Controller('debug')
export class DebugController {
  constructor(@Inject(PG_POOL) private pool: Pool) {}

  @Public()
  @Get('outbox-status')
  async getOutboxStatus() {
    const result = await this.pool.query(`
      SELECT 
        o.id,
        o.message_id,
        o.status,
        o.scheduled_at,
        o.attempts,
        o.created_at,
        NOW() as current_time,
        (o.scheduled_at <= NOW()) as should_process,
        LEFT(m.text, 30) as text_preview,
        c.channel_id,
        c.telegram_peer_id IS NOT NULL as has_telegram_peer_id
      FROM outbox o
      JOIN messages m ON o.message_id = m.id
      JOIN conversations c ON m.conversation_id = c.id
      WHERE o.status = 'pending'
      ORDER BY o.created_at DESC
      LIMIT 10
    `);

    const stats = await this.pool.query(`
      SELECT 
        COUNT(*) as total_pending,
        COUNT(*) FILTER (WHERE scheduled_at <= NOW()) as ready_to_send,
        COUNT(*) FILTER (WHERE scheduled_at > NOW()) as scheduled_future
      FROM outbox
      WHERE status = 'pending'
    `);

    return {
      stats: stats.rows[0],
      pending_messages: result.rows,
    };
  }

  @Public()
  @Get('conversations')
  async getConversations() {
    const result = await this.pool.query(`
      SELECT 
        id,
        channel_id,
        external_chat_id,
        chat_title,
        telegram_peer_id IS NOT NULL as has_telegram_peer_id,
        LENGTH(telegram_peer_id) as peer_id_length,
        created_at
      FROM conversations
      WHERE channel_id LIKE 'telegram:%'
      ORDER BY created_at DESC
      LIMIT 20
    `);

    return {
      conversations: result.rows,
    };
  }
}


