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
    objectKey?: string,
    replyTo?: string
  ): Promise<any> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Проверяем, существует ли колонка reply_to
      const hasReplyToColumn = await this.hasReplyToColumn();

      console.log(`🔍 About to insert message: threadId=${threadId}, senderId=${senderId}, textLength=${text?.length || 0}, objectKey=${objectKey || 'NULL'}, replyTo=${replyTo || 'NULL'}, hasReplyToColumn=${hasReplyToColumn}`);
      
      let msgRes;
      if (hasReplyToColumn) {
        msgRes = await client.query(
          `INSERT INTO messages (conversation_id, sender_id, direction, text, object_key, reply_to, delivery_status, created_at, updated_at)
           VALUES ($1, $2, 'out', $3, $4, $5, 'queued', NOW(), NOW())
           RETURNING *`,
          [threadId, senderId, text || '', objectKey || null, replyTo || null]
        );
      } else {
        // Если колонки нет, вставляем без reply_to
        msgRes = await client.query(
          `INSERT INTO messages (conversation_id, sender_id, direction, text, object_key, delivery_status, created_at, updated_at)
           VALUES ($1, $2, 'out', $3, $4, 'queued', NOW(), NOW())
           RETURNING *`,
          [threadId, senderId, text || '', objectKey || null]
        );
      }
      const message = msgRes.rows[0];
      console.log(`✅ Message created: id=${message.id}, threadId=${threadId}, hasObjectKey=${!!message.object_key}, objectKey=${message.object_key || 'null'}, textLength=${message.text?.length || 0}`);

      const outboxRes = await client.query(
        `INSERT INTO outbox (message_id, conversation_id, status, scheduled_at, attempts, created_at)
         VALUES ($1, $2, 'pending', NOW(), 0, NOW())
         RETURNING *`,
        [message.id, threadId]
      );
      console.log(`✅ Outbox entry created: message_id=${message.id}, conversation_id=${threadId}, outbox_id=${outboxRes.rows[0].id}`);

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
      console.log(`✅ Transaction committed successfully for message ${message.id}`);
      return message;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ Transaction rolled back for message creation:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Find or create conversation thread by channel_id
   * Also searches by external_chat_id, sender_phone, and telegram_peer_id to find deleted conversations
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
      // Try to find existing thread by channel_id (including deleted ones)
      let existingThread = await client.query(
        `SELECT * FROM conversations WHERE channel_id = $1`,
        [params.channel_id]
      );

      // If not found, try to find by other identifiers (even if deleted)
      if (existingThread.rows.length === 0) {
        const searchConditions: string[] = [];
        const searchValues: any[] = [];
        let paramIndex = 1;

        if (params.external_chat_id) {
          searchConditions.push(`external_chat_id = $${paramIndex++}`);
          searchValues.push(params.external_chat_id);
        }
        if (params.sender_phone) {
          searchConditions.push(`sender_phone = $${paramIndex++}`);
          searchValues.push(params.sender_phone);
        }
        if (params.telegram_peer_id) {
          searchConditions.push(`telegram_peer_id = $${paramIndex++}`);
          searchValues.push(params.telegram_peer_id);
        }

        if (searchConditions.length > 0) {
          const searchQuery = `
            SELECT * FROM conversations 
            WHERE (${searchConditions.join(' OR ')})
            ORDER BY deleted_at NULLS FIRST, created_at DESC
            LIMIT 1
          `;
          existingThread = await client.query(searchQuery, searchValues);
        }
      }

      if (existingThread.rows.length > 0) {
        const foundThread = existingThread.rows[0];
        const isDeleted = foundThread.deleted_at !== null;

        // If thread was deleted, restore it
        if (isDeleted) {
          await client.query(
            `UPDATE conversations SET deleted_at = NULL, is_deleted = false, updated_at = NOW() WHERE id = $1`,
            [foundThread.id]
          );
          // Re-add to Redis unassigned set if it was removed
          await this.redis.sadd('inbox:unassigned', foundThread.id);
        }
        // Update chat info if provided (обновляем только если новое значение не null)
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        // Update channel_id if it changed (for restored conversations)
        if (foundThread.channel_id !== params.channel_id) {
          updates.push(`channel_id = $${paramIndex++}`);
          values.push(params.channel_id);
        }

        if (params.chat_title !== undefined) {
          // Обновляем chat_title если:
          // 1. Новое значение не null И не "Unknown" (всегда обновляем лучшее значение)
          // 2. Старое было "Unknown", а новое что-то другое
          // 3. Новое значение содержит больше информации (не начинается с "@" или "Chat")
          const currentTitle = foundThread.chat_title;
          const newTitle = params.chat_title;
          
          // Определяем приоритет имен
          const getTitlePriority = (title: string | null): number => {
            if (!title || title === 'Unknown') return 0;
            if (title.startsWith('Chat ') || title.startsWith('@')) return 1; // Низкий приоритет (fallback)
            if (title.includes('+') && /^\+?[0-9]+$/.test(title.replace(/\s/g, ''))) return 2; // Телефон
            return 3; // Полное имя - высокий приоритет
          };
          
          const shouldUpdate = 
            (newTitle && newTitle !== 'Unknown' && getTitlePriority(newTitle) > getTitlePriority(currentTitle)) ||
            (currentTitle === 'Unknown' && newTitle && newTitle !== 'Unknown') ||
            (newTitle && !newTitle.startsWith('@') && !newTitle.startsWith('Chat ') && currentTitle && (currentTitle.startsWith('@') || currentTitle.startsWith('Chat ')));
          
          if (shouldUpdate || params.chat_title === null) {
            updates.push(`chat_title = $${paramIndex++}`);
            values.push(params.chat_title);
          }
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
          // telegram_peer_id имеет приоритет - если есть (не null), всегда обновляем
          // Если null, не обновляем (оставляем старое значение)
          if (params.telegram_peer_id !== null) {
            updates.push(`telegram_peer_id = $${paramIndex++}`);
            values.push(params.telegram_peer_id);
          }
        }
        // Для контактных данных - обновляем только если новое значение не null
        if (params.sender_phone !== undefined && params.sender_phone !== null) {
          updates.push(`sender_phone = $${paramIndex++}`);
          values.push(params.sender_phone);
        }
        if (params.sender_username !== undefined && params.sender_username !== null) {
          updates.push(`sender_username = $${paramIndex++}`);
          values.push(params.sender_username);
        }
        if (params.sender_first_name !== undefined && params.sender_first_name !== null) {
          updates.push(`sender_first_name = $${paramIndex++}`);
          values.push(params.sender_first_name);
        }
        if (params.sender_last_name !== undefined && params.sender_last_name !== null) {
          updates.push(`sender_last_name = $${paramIndex++}`);
          values.push(params.sender_last_name);
        }

        if (updates.length > 0) {
          values.push(foundThread.id);
          const currentData = foundThread;
          console.log(`🔄 Updating conversation ${foundThread.id}: ${updates.join(', ')}`);
          console.log(`📊 Before update: chat_title="${currentData.chat_title}", telegram_peer_id=${currentData.telegram_peer_id ? 'present' : 'null'}`);
          console.log(`📊 Update values: chat_title=${params.chat_title}, telegram_peer_id=${params.telegram_peer_id ? 'present' : 'null'}`);
          
          await client.query(
            `UPDATE conversations 
             SET ${updates.join(', ')}, updated_at = NOW()
             WHERE id = $${paramIndex}`,
            values
          );
          // Fetch updated thread
          const updated = await client.query(
            `SELECT * FROM conversations WHERE id = $1`,
            [foundThread.id]
          );
          console.log(`✅ Conversation ${isDeleted ? 'restored and ' : ''}updated: chat_title="${updated.rows[0].chat_title}", telegram_peer_id=${updated.rows[0].telegram_peer_id ? 'present' : 'null'}`);
          return updated.rows[0];
        }
        const currentData = foundThread;
        console.log(`⏭️ No updates needed for conversation ${foundThread.id}`);
        console.log(`📊 Current data: chat_title="${currentData.chat_title}", telegram_peer_id=${currentData.telegram_peer_id ? 'present' : 'null'}`);
        console.log(`📊 Received params: chat_title=${params.chat_title}, telegram_peer_id=${params.telegram_peer_id ? 'present' : 'null'}`);
        return foundThread;
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
   * Increments unread_count if direction is 'in'
   */
  async createMessage(params: {
    conversation_id: string;
    direction: 'in' | 'out';
    text: string;
    external_message_id?: string;
    sender_name?: string;
    metadata?: any;
    object_key?: string;
  }): Promise<any> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO messages (conversation_id, direction, text, external_message_id, sender_name, metadata, object_key, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING *`,
        [
          params.conversation_id,
          params.direction,
          params.text,
          params.external_message_id || null,
          params.sender_name || null,
          params.metadata ? JSON.stringify(params.metadata) : null,
          params.object_key || null,
        ]
      );

      const message = result.rows[0];

      // Update thread's last_message_at and increment unread_count for incoming messages
      if (params.direction === 'in') {
        await client.query(
          `UPDATE conversations 
           SET last_message_at = NOW(), 
               unread_count = unread_count + 1,
               updated_at = NOW() 
           WHERE id = $1`,
          [params.conversation_id]
        );
      } else {
        await client.query(
          `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [params.conversation_id]
        );
      }

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
   * Mark conversation as read (reset unread_count)
   */
  async markConversationAsRead(conversationId: string): Promise<void> {
    await this.pool.query(
      `UPDATE conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1`,
      [conversationId]
    );
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
   * Get all conversations ordered by last activity (excluding deleted and archived)
   * @param platform Optional platform filter (e.g., 'telegram', 'whatsapp')
   */
  async getAllConversations(platform?: string): Promise<any[]> {
    let query = `SELECT * FROM conversations 
       WHERE (deleted_at IS NULL OR is_deleted = false OR is_deleted IS NULL) AND (is_archived = false OR is_archived IS NULL)`;
    const params: any[] = [];
    
    if (platform) {
      query += ` AND channel_id LIKE $${params.length + 1}`;
      params.push(`${platform}:%`);
    }
    
    query += ` ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 100`;
    
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get archived conversations ordered by last activity
   */
  async getArchivedConversations(): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM conversations 
       WHERE is_archived = true AND (deleted_at IS NULL OR is_deleted = false OR is_deleted IS NULL)
       ORDER BY COALESCE(last_message_at, created_at) DESC
       LIMIT 100`
    );
    return result.rows;
  }

  /**
   * Get deleted conversations (trash)
   */
  async getDeletedConversations(): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM conversations 
       WHERE is_deleted = true OR deleted_at IS NOT NULL
       ORDER BY deleted_at DESC
       LIMIT 100`
    );
    return result.rows;
  }

  /**
   * Restore a deleted conversation
   */
  async restoreConversation(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE conversations SET is_deleted = false, deleted_at = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE conversations SET is_archived = true, updated_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  /**
   * Update conversation (e.g., custom_name)
   */
  async updateConversation(id: string, updates: { custom_name?: string }): Promise<void> {
    if (updates.custom_name !== undefined) {
      await this.pool.query(
        `UPDATE conversations SET custom_name = $1, updated_at = NOW() WHERE id = $2`,
        [updates.custom_name, id]
      );
    }
  }

  /**
   * Get all messages for a conversation
   */
  /**
   * Get single message by ID
   */
  async getMessage(messageId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT * FROM messages WHERE id = $1`,
      [messageId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get message with reply_to_message joined (for display)
   */
  async getMessageWithReply(messageId: string): Promise<any> {
    const hasReplyToColumn = await this.hasReplyToColumn();

    let result;
    if (hasReplyToColumn) {
      result = await this.pool.query(
        `SELECT 
          m.*,
          r.id as reply_to_id,
          r.text as reply_to_text,
          r.sender_name as reply_to_sender_name,
          r.direction as reply_to_direction,
          r.created_at as reply_to_created_at
         FROM messages m
         LEFT JOIN messages r ON m.reply_to = r.id
         WHERE m.id = $1`,
        [messageId]
      );
    } else {
      result = await this.pool.query(
        `SELECT * FROM messages WHERE id = $1`,
        [messageId]
      );
    }

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ...row,
      reply_to_message: hasReplyToColumn && row.reply_to_id ? {
        id: row.reply_to_id,
        text: row.reply_to_text,
        sender_name: row.reply_to_sender_name,
        direction: row.reply_to_direction,
        created_at: row.reply_to_created_at
      } : null
    };
  }

  /**
   * Проверка существования колонки reply_to в таблице messages
   */
  async hasReplyToColumn(): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'messages' AND column_name = 'reply_to'
    `);
    return result.rows.length > 0;
  }

  /**
   * Search conversations and messages by query
   * Returns conversations that match the search query in their title, sender name, or messages
   */
  async searchConversationsAndMessages(query: string, limit: number = 50): Promise<{
    conversations: any[];
    messages: any[];
  }> {
    try {
      if (!query || query.trim().length === 0) {
        return { conversations: [], messages: [] };
      }

      // For ILIKE, we need to escape special characters properly
      // Escape % and _ characters for LIKE pattern matching
      const escapedQuery = query.trim().replace(/[%_\\]/g, (char) => {
        if (char === '%') return '\\%';
        if (char === '_') return '\\_';
        if (char === '\\') return '\\\\';
        return char;
      });
      const searchTerm = `%${escapedQuery}%`;
      
      console.log(`🔍 Search query: "${query}", escaped: "${escapedQuery}", searchTerm: "${searchTerm}"`);

      // Search conversations by title, sender name, phone, username
      const conversationsQuery = `
        SELECT DISTINCT c.*
        FROM conversations c
        WHERE (
          (c.deleted_at IS NULL OR c.is_deleted = false OR c.is_deleted IS NULL)
          AND (c.is_archived = false OR c.is_archived IS NULL)
          AND (
            c.chat_title ILIKE $1 OR
            c.custom_name ILIKE $1 OR
            c.sender_first_name ILIKE $1 OR
            c.sender_last_name ILIKE $1 OR
            COALESCE(c.sender_first_name || ' ' || c.sender_last_name, '') ILIKE $1 OR
            c.sender_phone ILIKE $1 OR
            c.sender_username ILIKE $1 OR
            c.external_chat_id ILIKE $1
          )
        )
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
        LIMIT $2
      `;

      const conversationsResult = await this.pool.query(conversationsQuery, [searchTerm, limit]);
      console.log(`🔍 Found ${conversationsResult.rows.length} conversations matching "${query}"`);

      // Search messages by text content
      // Check if text column exists and handle NULL values
      const messagesQuery = `
        SELECT DISTINCT m.*, c.chat_title, c.custom_name, c.channel_id, c.id as conversation_id_display
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE (
          (c.deleted_at IS NULL OR c.is_deleted = false OR c.is_deleted IS NULL)
          AND (c.is_archived = false OR c.is_archived IS NULL)
          AND m.text IS NOT NULL
          AND m.text ILIKE $1
        )
        ORDER BY m.created_at DESC
        LIMIT $2
      `;

      const messagesResult = await this.pool.query(messagesQuery, [searchTerm, limit]);
      console.log(`🔍 Found ${messagesResult.rows.length} messages matching "${query}"`);

      // Format messages with reply_to_message if column exists
      const hasReplyToColumn = await this.hasReplyToColumn();
      let formattedMessages = messagesResult.rows;
      
      if (hasReplyToColumn && formattedMessages.length > 0) {
        const messageIds = formattedMessages.map(m => m.id);
        const replyQuery = `
          SELECT 
            m.id,
            r.id as reply_to_id,
            r.text as reply_to_text,
            r.sender_name as reply_to_sender_name,
            r.direction as reply_to_direction,
            r.created_at as reply_to_created_at
          FROM messages m
          LEFT JOIN messages r ON m.reply_to = r.id
          WHERE m.id = ANY($1::uuid[])
        `;
        const replyResult = await this.pool.query(replyQuery, [messageIds]);
        const replyMap = new Map(replyResult.rows.map(r => [r.id, r.reply_to_id ? {
          id: r.reply_to_id,
          text: r.reply_to_text,
          sender_name: r.reply_to_sender_name,
          direction: r.reply_to_direction,
          created_at: r.reply_to_created_at
        } : null]));

        formattedMessages = formattedMessages.map(m => ({
          ...m,
          reply_to_message: replyMap.get(m.id) || null
        }));
      }

      return {
        conversations: conversationsResult.rows,
        messages: formattedMessages
      };
    } catch (error) {
      console.error('❌ Search error:', error);
      console.error('Error details:', error.message, error.stack);
      throw error;
    }
  }

  async getMessages(conversationId: string): Promise<any[]> {
    // Сначала проверяем, существует ли колонка reply_to
    const hasReplyToColumn = await this.hasReplyToColumn();

    let result;
    if (hasReplyToColumn) {
      // Если колонка существует, делаем JOIN с reply_to
      result = await this.pool.query(
        `SELECT 
          m.*,
          r.id as reply_to_id,
          r.text as reply_to_text,
          r.sender_name as reply_to_sender_name,
          r.direction as reply_to_direction,
          r.created_at as reply_to_created_at
         FROM messages m
         LEFT JOIN messages r ON m.reply_to = r.id
         WHERE m.conversation_id = $1 
         ORDER BY m.created_at ASC`,
        [conversationId]
      );
    } else {
      // Если колонки нет, делаем простой SELECT без JOIN
      result = await this.pool.query(
        `SELECT * FROM messages 
         WHERE conversation_id = $1 
         ORDER BY created_at ASC`,
        [conversationId]
      );
    }

    // Преобразуем результат для удобства frontend
    return result.rows.map(row => ({
      ...row,
      reply_to_message: hasReplyToColumn && row.reply_to_id ? {
        id: row.reply_to_id,
        text: row.reply_to_text,
        sender_name: row.reply_to_sender_name,
        direction: row.reply_to_direction,
        created_at: row.reply_to_created_at
      } : null
    }));
  }

  /**
   * Soft delete conversation (mark as deleted instead of physically deleting)
   * This allows restoring conversations when new messages arrive from the same sender
   */
  async deleteConversation(conversationId: string): Promise<{ success: boolean; message: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Soft delete conversation (mark as deleted)
      const result = await client.query(
        `UPDATE conversations 
         SET deleted_at = NOW(), is_deleted = true, updated_at = NOW() 
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id, channel_id`,
        [conversationId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        // Check if conversation exists but is already deleted
        const existing = await client.query(
          `SELECT id FROM conversations WHERE id = $1`,
          [conversationId]
        );
        if (existing.rows.length === 0) {
          return { success: false, message: 'Conversation not found' };
        } else {
          return { success: false, message: 'Conversation already deleted' };
        }
      }

      // Remove from Redis unassigned set
      await this.redis.srem('inbox:unassigned', conversationId);
      await this.redis.del(`inbox:assignee:${conversationId}`);

      await client.query('COMMIT');

      return { 
        success: true, 
        message: `Deleted conversation ${conversationId} (${result.rows[0].channel_id})` 
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}














