import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../db/db.module';

/**
 * Simple HTML sanitizer to prevent XSS
 * Allows only basic formatting: b, i, u, br, p tags
 */
function sanitizeHtml(text: string): string {
  // Remove all HTML tags except allowed ones
  const allowedTags = ['b', 'i', 'u', 'br', 'p'];
  let sanitized = text;
  
  // Remove script and style tags completely
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove event handlers
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Escape remaining potentially dangerous content
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  return sanitized;
}

@Injectable()
export class NotesService {
  constructor(@Inject(PG_POOL) private pool: Pool) {}

  /**
   * Get note for a conversation and user
   */
  async get(conversationId: string, userId: string): Promise<any | null> {
    const result = await this.pool.query(
      `SELECT * FROM conversation_notes 
       WHERE conversation_id = $1 AND user_id = $2 
       ORDER BY updated_at DESC 
       LIMIT 1`,
      [conversationId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Upsert (create or update) note
   */
  async upsert(conversationId: string, userId: string, noteText: string): Promise<any> {
    // Sanitize HTML to prevent XSS
    const sanitizedText = sanitizeHtml(noteText.trim());

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check if note exists
      const existing = await client.query(
        `SELECT id FROM conversation_notes 
         WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, userId]
      );

      let result;
      if (existing.rows.length > 0) {
        // Update existing
        result = await client.query(
          `UPDATE conversation_notes 
           SET note_text = $1, updated_at = NOW() 
           WHERE id = $2 
           RETURNING *`,
          [sanitizedText, existing.rows[0].id]
        );
      } else {
        // Create new
        result = await client.query(
          `INSERT INTO conversation_notes (conversation_id, user_id, note_text, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           RETURNING *`,
          [conversationId, userId, sanitizedText]
        );
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Remove note
   */
  async remove(conversationId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM conversation_notes 
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    return result.rowCount > 0;
  }
}

