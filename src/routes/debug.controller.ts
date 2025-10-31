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
    const pending = await this.pool.query(`
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
        c.telegram_peer_id IS NOT NULL as has_telegram_peer
      FROM outbox o
      JOIN messages m ON o.message_id = m.id
      JOIN conversations c ON m.conversation_id = c.id
      WHERE o.status = 'pending'
      ORDER BY o.created_at DESC
      LIMIT 10
    `);

    const failed = await this.pool.query(`
      SELECT
        o.id,
        o.message_id,
        o.status,
        o.attempts,
        o.last_error,
        o.created_at,
        o.updated_at,
        LEFT(m.text, 30) as text_preview,
        c.channel_id,
        c.telegram_peer_id IS NOT NULL as has_telegram_peer,
        c.telegram_peer_id
      FROM outbox o
      JOIN messages m ON o.message_id = m.id
      JOIN conversations c ON m.conversation_id = c.id
      WHERE o.status = 'failed'
      ORDER BY o.updated_at DESC
      LIMIT 10
    `);

    const stats = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as total_pending,
        COUNT(*) FILTER (WHERE status = 'failed') as total_failed,
        COUNT(*) FILTER (WHERE status = 'done') as total_done,
        COUNT(*) FILTER (WHERE status = 'processing') as total_processing,
        COUNT(CASE WHEN status = 'pending' AND scheduled_at <= NOW() THEN 1 END) as ready_to_process
      FROM outbox
    `);

    return {
      stats: stats.rows[0],
      pending_jobs: pending.rows,
      failed_jobs: failed.rows,
    };
  }

  @Public()
  @Get('unknown-chats')
  async getUnknownChats() {
    // Возвращаем список чатов с chat_title = 'Unknown' и telegram_peer_id = null
    const result = await this.pool.query(`
      SELECT 
        c.id,
        c.channel_id,
        c.chat_title,
        c.telegram_peer_id,
        c.created_at,
        c.last_message_at,
        COUNT(m.id) as message_count
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.chat_title = 'Unknown' 
        AND c.telegram_peer_id IS NULL
      GROUP BY c.id
      ORDER BY c.last_message_at DESC NULLS LAST
    `);

    return {
      unknown_chats: result.rows,
      count: result.rows.length
    };
  }
}


