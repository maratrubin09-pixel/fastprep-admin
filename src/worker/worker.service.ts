import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';
import { MetricsService } from './metrics.service';
import { AlertsService } from './alerts.service';
import { TelegramService } from '../messengers/telegram/telegram.service';
import axios from 'axios';

const MAX_ATTEMPTS = Number(process.env.OUTBOX_MAX_ATTEMPTS || 5);
const BASE_BACKOFF_MS = Number(process.env.OUTBOX_BASE_BACKOFF_MS || 1000);
const MAX_BACKOFF_MS = Number(process.env.OUTBOX_MAX_BACKOFF_MS || 60000);
const BATCH_SIZE = Number(process.env.OUTBOX_BATCH_SIZE || 10);
const CONCURRENCY = Number(process.env.OUTBOX_CONCURRENCY || 5);

interface OutboxRow {
  id: string;
  message_id: string;
  attempts: number;
}

@Injectable()
export class WorkerService implements OnModuleDestroy {
  private running = false;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(PG_POOL) private pool: Pool,
    private metrics: MetricsService,
    private alerts: AlertsService,
    private telegramService: TelegramService
  ) {}

  async start() {
    this.running = true;
    await this.loop();
  }

  async stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  onModuleDestroy() {
    this.stop();
  }

  private async loop() {
    while (this.running) {
      try {
        await this.processBatch();
        await this.alerts.checkAndAlert();
      } catch (err) {
        console.error('Worker loop error:', err);
      }

      // Задержка 1 секунда (оптимизировано с 5 сек)
      await new Promise((resolve) => {
        this.timer = setTimeout(resolve, 1000);
      });
    }
  }

  private async processBatch() {
    const rows = await this.leaseBatch();
    if (rows.length === 0) return;

    // Параллельная обработка (CONCURRENCY)
    const chunks: OutboxRow[][] = [];
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
  private async leaseBatch(): Promise<OutboxRow[]> {
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
    return res.rows as OutboxRow[];
  }

  /**
   * Обработка одной записи outbox
   */
  private async processOne(row: OutboxRow) {
    const client = await this.pool.connect();
    try {
      // Получить данные сообщения
      const msgRes = await client.query(
        `SELECT conversation_id, text, object_key FROM messages WHERE id = $1`,
        [row.message_id]
      );
      if (msgRes.rows.length === 0) {
        // Сообщение удалено — помечаем outbox как failed
        await this.markFailed(client, row.id, 'Message not found');
        this.metrics.outboxProcessedTotal.inc({ status: 'failed' });
        return;
      }

      const msg = msgRes.rows[0];

      // Определяем платформу из channel_id и получаем telegram_peer_id
      const convRes = await client.query(
        `SELECT channel_id, telegram_peer_id FROM conversations WHERE id = $1`,
        [msg.conversation_id]
      );
      const channelId = convRes.rows[0]?.channel_id || '';
      const telegramPeerId = convRes.rows[0]?.telegram_peer_id || null;
      const platform = channelId.split(':')[0]; // например "telegram:123" -> "telegram"

      // Вызов соответствующего сервиса
      const start = Date.now();
      let result: { success: boolean; externalMessageId?: string; error?: string };

      if (platform === 'telegram') {
        result = await this.sendViaTelegram(channelId, msg.text, telegramPeerId);
      } else {
        // Fallback to TG-Adapter for legacy
        result = await this.callTgAdapter(msg.conversation_id, msg.text, msg.object_key);
      }

      const duration = (Date.now() - start) / 1000;
      this.metrics.adapterLatencySeconds.observe(duration);

      if (result.success) {
        // Успех: outbox='done', messages.delivery_status='sent'
        await client.query('BEGIN');
        await client.query(
          `UPDATE outbox SET status = 'done', updated_at = NOW() WHERE id = $1`,
          [row.id]
        );
        await client.query(
          `UPDATE messages SET delivery_status = 'sent', external_message_id = $1, updated_at = NOW() WHERE id = $2`,
          [result.externalMessageId, row.message_id]
        );
        await client.query('COMMIT');
        this.metrics.outboxProcessedTotal.inc({ status: 'done' });

        // Уведомляем API об обновлении статуса через WebSocket
        await this.notifyMessageStatusUpdate(msg.conversation_id, row.message_id, 'sent');
      } else {
        // Ошибка: retry или failed
        const errorMsg = result.error || 'Unknown error';
        if (row.attempts >= MAX_ATTEMPTS) {
          await this.markFailed(client, row.id, errorMsg);
          this.metrics.outboxProcessedTotal.inc({ status: 'failed' });
        } else {
          await this.markRetry(client, row.id, row.attempts, errorMsg);
          this.metrics.outboxProcessedTotal.inc({ status: 'retry' });
        }
      }
    } catch (err: any) {
      console.error(`Worker error for outbox ${row.id}:`, err);
      // Retry
      if (row.attempts >= MAX_ATTEMPTS) {
        await this.markFailed(client, row.id, err.message);
        this.metrics.outboxProcessedTotal.inc({ status: 'failed' });
      } else {
        await this.markRetry(client, row.id, row.attempts, err.message);
        this.metrics.outboxProcessedTotal.inc({ status: 'retry' });
      }
    } finally {
      client.release();
    }
  }

  /**
   * Send via Telegram TDLib
   */
  private async sendViaTelegram(
    channelId: string,
    text: string,
    telegramPeerId?: string | null
  ): Promise<{ success: boolean; externalMessageId?: string; error?: string }> {
    try {
      // Extract chat ID from channel_id format: "telegram:12345"
      const chatId = channelId.split(':')[1];
      if (!chatId) {
        return { success: false, error: 'Invalid channel_id format' };
      }

      const result = await this.telegramService.sendMessage(chatId, text, telegramPeerId);
      return {
        success: true,
        externalMessageId: String(result.id),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Telegram send failed',
      };
    }
  }

  /**
   * Вызов TG-Adapter: POST {TG_ADAPTER_URL}/api/send
   */
  private async callTgAdapter(
    conversationId: string,
    text: string,
    objectKey?: string
  ): Promise<{ success: boolean; externalMessageId?: string; error?: string }> {
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

      const data: any = await response.json();
      return { success: true, externalMessageId: data.messageId || 'unknown' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Пометить как failed
   */
  private async markFailed(client: any, outboxId: string, error: string) {
    await client.query(
      `UPDATE outbox SET status = 'failed', last_error = $1, updated_at = NOW() WHERE id = $2`,
      [error, outboxId]
    );
  }

  /**
   * Пометить как retry с backoff
   */
  private async markRetry(client: any, outboxId: string, attempts: number, error: string) {
    const backoff = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempts) + Math.random() * 1000, MAX_BACKOFF_MS);
    const scheduledAt = new Date(Date.now() + backoff);

    await client.query(
      `UPDATE outbox SET status = 'pending', scheduled_at = $1, last_error = $2, updated_at = NOW() WHERE id = $3`,
      [scheduledAt, error, outboxId]
    );
  }

  /**
   * Уведомление API об обновлении статуса сообщения (для WebSocket broadcast)
   */
  private async notifyMessageStatusUpdate(conversationId: string, messageId: string, status: string) {
    try {
      const backendUrl = process.env.BACKEND_URL;
      const serviceJwt = process.env.SERVICE_JWT;

      if (!backendUrl || !serviceJwt) {
        console.warn('⚠️ BACKEND_URL or SERVICE_JWT not set, skipping status update notification');
        return;
      }

      await axios.post(
        `${backendUrl}/api/inbox/events/message-status`,
        {
          conversationId,
          messageId,
          status,
        },
        {
          headers: {
            'Authorization': `Bearer ${serviceJwt}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error: any) {
      console.error('Failed to notify message status update:', error.message);
    }
  }
}

