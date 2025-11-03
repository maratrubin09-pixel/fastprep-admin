import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../db/db.module';

@Injectable()
export class ConversationSettingsService {
  constructor(@Inject(PG_POOL) private pool: Pool) {}

  /**
   * Mute conversation for user
   */
  async muteConversation(conversationId: string, userId: string, until?: Date): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO conversation_user_settings (conversation_id, user_id, is_muted, muted_until)
       VALUES ($1, $2, true, $3)
       ON CONFLICT (conversation_id, user_id) 
       DO UPDATE SET is_muted = true, muted_until = $3
       RETURNING *`,
      [conversationId, userId, until || null]
    );
    return result.rows[0];
  }

  /**
   * Unmute conversation for user
   */
  async unmuteConversation(conversationId: string, userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE conversation_user_settings 
       SET is_muted = false, muted_until = NULL
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
  }

  /**
   * Get conversation settings for user
   */
  async getSettings(conversationId: string, userId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT * FROM conversation_user_settings 
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    return result.rows[0] || { is_muted: false, muted_until: null };
  }

  /**
   * Check if conversation is muted for user
   */
  async isMuted(conversationId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT is_muted, muted_until FROM conversation_user_settings 
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    if (result.rows.length === 0) return false;
    
    const settings = result.rows[0];
    if (!settings.is_muted) return false;
    
    // Check if temporary mute expired
    if (settings.muted_until && new Date(settings.muted_until) < new Date()) {
      // Auto-unmute
      await this.unmuteConversation(conversationId, userId);
      return false;
    }
    
    return true;
  }
}

