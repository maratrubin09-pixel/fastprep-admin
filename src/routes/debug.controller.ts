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
        c.telegram_peer_id IS NOT NULL as has_telegram_peer
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
        COUNT(CASE WHEN o.scheduled_at <= NOW() THEN 1 END) as ready_to_process
      FROM outbox o
      WHERE o.status = 'pending'
    `);

    return {
      stats: stats.rows[0],
      pending_jobs: result.rows,
    };
  }
}


