import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';
import { S3Service } from '../storage/s3.service';
import { v4 as uuidv4 } from 'uuid';

interface NylasMessage {
  id: string;
  thread_id: string;
  from: Array<{ email: string; name?: string }>;
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  bcc?: Array<{ email: string; name?: string }>;
  subject?: string;
  body?: string;
  date: number;
  attachments?: Array<{
    id: string;
    filename: string;
    content_type: string;
    size: number;
    content_id?: string;
  }>;
}

@Injectable()
export class EmailParseService {
  private readonly logger = new Logger(EmailParseService.name);

  constructor(
    @Inject(PG_POOL) private pool: Pool,
    private s3Service: S3Service
  ) {}

  /**
   * Parse and save email message from Nylas webhook
   */
  async parseAndSaveMessage(
    emailAccountId: string,
    message: NylasMessage,
    accessToken: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Upsert thread by nylas_thread_id
      const threadRes = await client.query(
        `SELECT id FROM conversations WHERE nylas_thread_id = $1 LIMIT 1`,
        [message.thread_id]
      );

      let conversationId: string;
      if (threadRes.rows.length > 0) {
        conversationId = threadRes.rows[0].id;
      } else {
        // Create new conversation
        const fromEmail = message.from[0]?.email || 'unknown';
        const fromName = message.from[0]?.name || fromEmail;
        const convRes = await client.query(
          `INSERT INTO conversations (
            channel_id, sender_name, sender_email, nylas_thread_id,
            last_message_preview, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          RETURNING id`,
          [
            `email:${fromEmail}`,
            fromName,
            fromEmail,
            message.thread_id,
            message.subject || message.body?.substring(0, 100) || '',
          ]
        );
        conversationId = convRes.rows[0].id;
      }

      // 2. Save message
      const receivedAt = new Date(message.date * 1000);
      const msgRes = await client.query(
        `INSERT INTO email_messages (
          email_account_id, nylas_message_id, nylas_thread_id, conversation_id,
          direction, subject, body_html, body_text,
          from_email, from_name, to_emails, cc_emails, bcc_emails,
          received_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'inbound', $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
        ON CONFLICT (nylas_message_id) DO NOTHING
        RETURNING id`,
        [
          emailAccountId,
          message.id,
          message.thread_id,
          conversationId,
          message.subject || null,
          message.body || null,
          this.htmlToText(message.body || ''),
          message.from[0]?.email || null,
          message.from[0]?.name || null,
          message.to?.map((t) => t.email) || [],
          message.cc?.map((c) => c.email) || [],
          message.bcc?.map((b) => b.email) || [],
          receivedAt,
        ]
      );

      const emailMessageId = msgRes.rows[0]?.id;

      // 3. Process attachments
      if (message.attachments && message.attachments.length > 0 && emailMessageId) {
        await this.processAttachments(
          client,
          emailMessageId,
          message.attachments,
          accessToken
        );
      }

      // 4. Save corresponding message in messages table for inbox
      if (emailMessageId) {
        const bodyText = this.htmlToText(message.body || '') || message.subject || '';
        await client.query(
          `INSERT INTO messages (
            conversation_id, sender_id, direction, text, delivery_status,
            external_message_id, created_at, updated_at
          ) VALUES ($1, NULL, 'in', $2, 'received', $3, $4, $4)
          ON CONFLICT DO NOTHING`,
          [conversationId, bodyText.substring(0, 1000), message.id, receivedAt]
        );
      }

      await client.query('COMMIT');
      this.logger.log(`✅ Parsed and saved email message ${message.id}`);
    } catch (error: any) {
      await client.query('ROLLBACK');
      this.logger.error(`❌ Failed to parse email message ${message.id}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process attachments: download and upload to S3
   */
  private async processAttachments(
    client: any,
    emailMessageId: string,
    attachments: Array<{
      id: string;
      filename: string;
      content_type: string;
      size: number;
      content_id?: string;
    }>,
    accessToken: string
  ): Promise<void> {
    for (const attachment of attachments) {
      try {
        // Download attachment from Nylas
        const downloadUrl = `https://api.nylas.com/v3/files/${attachment.id}/download`;
        const response = await fetch(downloadUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          this.logger.warn(`Failed to download attachment ${attachment.id}`);
          continue;
        }

        const buffer = await response.arrayBuffer();
        const objectKey = `email-attachments/${uuidv4()}_${attachment.filename}`;

        // Upload to S3
        await this.s3Service.putObject(
          objectKey,
          Buffer.from(buffer),
          attachment.content_type
        );

        // Save attachment metadata
        await client.query(
          `INSERT INTO email_attachments (
            email_message_id, nylas_attachment_id, filename, content_type,
            size, object_key, is_inline, content_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            emailMessageId,
            attachment.id,
            attachment.filename,
            attachment.content_type,
            attachment.size,
            objectKey,
            !!attachment.content_id,
            attachment.content_id || null,
          ]
        );
      } catch (error: any) {
        this.logger.error(`Failed to process attachment ${attachment.id}:`, error);
      }
    }
  }

  /**
   * Convert HTML to plain text (simple implementation)
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }
}

