import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';

@Injectable()
export class AlertsService {
  private lastAlertTime = 0;

  constructor(@Inject(PG_POOL) private pool: Pool) {}

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

  private async sendAlert(count: number, windowSec: number) {
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
      } catch (err) {
        console.error('Failed to send Slack alert:', err);
      }
    }

    // Email (упрощённо — заглушка)
    console.log('EMAIL ALERT:', message);
  }
}






