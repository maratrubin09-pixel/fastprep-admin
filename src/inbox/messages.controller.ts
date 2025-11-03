import { Controller, Get, Post, Put, Delete, Param, Body, Query, BadRequestException, Req, UseGuards, Inject, forwardRef } from '@nestjs/common';
import { IsString, IsOptional } from 'class-validator';
import { S3Service } from '../storage/s3.service';
import { InboxService } from './inbox.service';
import { PresenceService } from './services/presence.service';
import { ConversationSettingsService } from './services/conversation-settings.service';
import { AuthzService } from '../authz/authz.service';
import { TelegramService } from '../messengers/telegram/telegram.service';
import { PepGuard, RequirePerm } from '../authz/pep.guard';

// Расширенный список разрешенных типов (должен совпадать с uploads.controller.ts)
const ALLOWED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'image/heic', 'image/heif', 'image/bmp', 'image/svg+xml',
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

class SendMessageDto {
  @IsString()
  @IsOptional()
  text?: string;
  
  @IsOptional()
  @IsString()
  objectKey?: string;
  
  @IsOptional()
  @IsString()
  replyTo?: string; // UUID сообщения, на которое отвечаем
  
  @IsOptional()
  @IsString()
  stickerId?: string; // Sticker ID for Telegram
}

@Controller('inbox')
export class MessagesController {
  constructor(
    private s3: S3Service,
    private inbox: InboxService,
    private presence: PresenceService,
    private settings: ConversationSettingsService,
    private authz: AuthzService,
    @Inject(forwardRef(() => TelegramService))
    private telegramService: TelegramService
  ) {}

  /**
   * GET /api/inbox/conversations
   * Get all conversations for the current user (excluding archived)
   * @query platform Optional platform filter (e.g., 'telegram', 'whatsapp')
   */
  @Get('conversations')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async getConversations(@Req() req: any, @Query('platform') platform?: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }
    
    return await this.inbox.getAllConversations(platform);
  }

  /**
   * GET /api/inbox/conversations/archived
   * Get all archived conversations
   */
  @Get('conversations/archived')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async getArchivedConversations(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }
    
    return await this.inbox.getArchivedConversations();
  }

  /**
   * GET /api/inbox/conversations/:id/messages
   * Get all messages for a conversation and mark as read
   */
  @Get('conversations/:id/messages')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async getMessages(@Param('id') threadId: string, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }
    
    // Mark conversation as read when opening it
    await this.inbox.markConversationAsRead(threadId);
    
    return await this.inbox.getMessages(threadId);
  }

  /**
   * POST /api/inbox/conversations/:id/messages
   * Валидация objectKey (HEAD: существует, допустимый MIME/размер, префикс inbox/{threadId}/)
   * Транзакция: messages (out, delivery_status='queued') → outbox (pending) → audit_logs
   * Возвращает 201 с полными данными сообщения для немедленного отображения в UI
   */
  @Post('conversations/:id/messages')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.send_message')
  async sendMessage(@Param('id') threadId: string, @Body() dto: SendMessageDto, @Req() req: any) {
    console.log('🔍 DEBUG sendMessage - dto:', JSON.stringify(dto));
    console.log('🔍 DEBUG sendMessage - dto.text:', dto.text, 'type:', typeof dto.text);
    
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    // Валидация вложения
    if (dto.objectKey) {
      const expectedPrefix = `inbox/${threadId}/`;
      if (!dto.objectKey.startsWith(expectedPrefix)) {
        throw new BadRequestException({ code: 'FOREIGN_OBJECT', message: 'Object key prefix mismatch' });
      }

      const head = await this.s3.headObject(dto.objectKey);
      if (!head.exists) {
        throw new BadRequestException({ code: 'FILE_NOT_FOUND', message: 'Attachment not found in S3' });
      }

      // Разрешаем все типы, которые начинаются с image/, video/, audio/ или в списке разрешенных
      const isAllowed = 
        head.contentType && (
          ALLOWED_TYPES.includes(head.contentType) || 
          head.contentType.startsWith('image/') || 
          head.contentType.startsWith('video/') || 
          head.contentType.startsWith('audio/')
        );
      
      if (!isAllowed) {
        throw new BadRequestException({ 
          code: 'TYPE_NOT_ALLOWED', 
          message: `Attachment type not allowed: ${head.contentType}` 
        });
      }

      if (head.size && head.size > MAX_SIZE) {
        throw new BadRequestException({ code: 'SIZE_EXCEEDED', message: 'Attachment size exceeds limit' });
      }
    }

    // Валидация reply_to (если указан)
    if (dto.replyTo) {
      // Проверяем, что колонка reply_to существует
      const hasReplyToColumn = await this.inbox.hasReplyToColumn();
      
      if (hasReplyToColumn) {
        // Проверяем, что сообщение существует и принадлежит этому чату
        const replyMessage = await this.inbox.getMessage(dto.replyTo);
        if (!replyMessage || replyMessage.conversation_id !== threadId) {
          throw new BadRequestException('Reply message not found or belongs to different conversation');
        }
      } else {
        // Если колонки нет, игнорируем replyTo
        console.warn('⚠️ replyTo ignored: reply_to column does not exist in database');
      }
    }

    // Validation: must have text, objectKey, or stickerId
    if (!dto.text && !dto.objectKey && !dto.stickerId) {
      throw new BadRequestException('Message must have text, attachment, or sticker');
    }

    // Создание сообщения + outbox + audit (возвращает полные данные сообщения)
    console.log(`📤 Creating outgoing message: threadId=${threadId}, userId=${userId}, hasObjectKey=${!!dto.objectKey}, replyTo=${dto.replyTo || 'null'}, stickerId=${dto.stickerId || 'null'}`);
    console.log(`📤 Full DTO received:`, JSON.stringify({ text: dto.text, objectKey: dto.objectKey, replyTo: dto.replyTo, stickerId: dto.stickerId, textLength: dto.text?.length || 0 }));
    const message = await this.inbox.createOutgoingMessage(threadId, userId, dto.text || '', dto.objectKey, dto.replyTo, dto.stickerId);
    console.log(`✅ Outgoing message created successfully: messageId=${message.id}, hasObjectKey=${!!message.object_key}, objectKey=${message.object_key || 'null'}`);

    // Получаем полное сообщение с reply_to_message для отображения
    const fullMessage = await this.inbox.getMessageWithReply(message.id);
    console.log(`📋 Full message with reply: hasReplyTo=${!!fullMessage?.reply_to_message}, replyToId=${fullMessage?.reply_to_message?.id || 'null'}`);

    // Возвращаем 201 Created с полными данными сообщения включая reply_to_message
    // Явно добавляем object_key и objectKey для совместимости с frontend
    return {
      ...fullMessage,
      object_key: fullMessage.object_key,
      objectKey: fullMessage.object_key, // camelCase для совместимости
    };
  }

  /**
   * POST /api/inbox/conversations/:id/archive
   * Archive a conversation
   */
  @Post('conversations/:id/archive')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async archiveConversation(@Param('id') threadId: string, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }
    
    await this.inbox.archiveConversation(threadId);
    return { success: true };
  }

  /**
   * PUT /api/inbox/conversations/:id
   * Update conversation (e.g., custom_name)
   */
  @Put('conversations/:id')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async updateConversation(@Param('id') threadId: string, @Body() body: { custom_name?: string }, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }
    
    await this.inbox.updateConversation(threadId, body);
    return { success: true };
  }

  /**
   * POST /api/inbox/telegram/find-and-start
   * Find and start a Telegram chat by username or phone
   */
  @Post('telegram/find-and-start')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.send_message')
  async findAndStartChat(@Body() body: { username?: string; phone?: string }, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    if (!body.username && !body.phone) {
      throw new BadRequestException('Either username or phone must be provided');
    }

    try {
      // Find user in Telegram
      const userData = await this.telegramService.findAndStartChat(body.username, body.phone);

      // Create or find conversation thread
      const channelId = `telegram:${userData.userId}`;
      const thread = await this.inbox.findOrCreateThread({
        channel_id: channelId,
        platform: 'telegram',
        chat_title: userData.chatTitle,
        chat_type: 'private',
        telegram_peer_id: userData.telegramPeerId,
        sender_phone: userData.phone,
        sender_username: userData.username,
        sender_first_name: userData.firstName,
        sender_last_name: userData.lastName,
      });

      return {
        success: true,
        conversation: thread,
        user: userData,
      };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to find and start chat');
    }
  }

  /**
   * GET /api/inbox/conversations/trash
   * Get all deleted conversations
   */
  @Get('conversations/trash')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async getDeletedConversations(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }
    
    return await this.inbox.getDeletedConversations();
  }

  /**
   * GET /api/inbox/search
   * Search conversations and messages by query
   * @query q Search query string
   * @query limit Maximum number of results (default: 50)
   */
  @Get('search')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async search(@Req() req: any, @Query('q') query?: string, @Query('limit') limit?: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    if (!query || query.trim().length === 0) {
      return { conversations: [], messages: [] };
    }

    console.log(`🔍 Search API called: query="${query}", userId=${userId}`);
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const searchResults = await this.inbox.searchConversationsAndMessages(query.trim(), limitNum);
    console.log(`🔍 Search API result: ${searchResults.conversations.length} conversations, ${searchResults.messages.length} messages`);
    
    return searchResults;
  }

  /**
   * POST /api/inbox/conversations/:id/restore
   * Restore a deleted conversation
   */
  @Post('conversations/:id/restore')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async restoreConversation(@Param('id') threadId: string, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }
    
    await this.inbox.restoreConversation(threadId);
    return { success: true };
  }

  /**
   * DELETE /api/inbox/conversations/:id
   * Удалить чат (soft delete для корзины)
   */
  @Delete('conversations/:id')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async deleteConversation(@Param('id') threadId: string, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }
    
    return await this.inbox.deleteConversation(threadId);
  }

  /**
   * PUT /api/inbox/messages/:id
   * Edit a message (only for outgoing messages)
   */
  @Put('messages/:id')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.send_message')
  async editMessage(@Param('id') messageId: string, @Body() body: { text: string }, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    if (!body.text || body.text.trim().length === 0) {
      throw new BadRequestException('Message text cannot be empty');
    }

    const updatedMessage = await this.inbox.editMessage(messageId, userId, body.text.trim());
    return updatedMessage;
  }

  /**
   * POST /api/inbox/messages/:id/reactions
   * Add or toggle a reaction to a message
   */
  @Post('messages/:id/reactions')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async addReaction(@Param('id') messageId: string, @Body() body: { emoji: string }, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    if (!body.emoji || body.emoji.trim().length === 0 || body.emoji.length > 10) {
      throw new BadRequestException('Invalid emoji');
    }

    const updatedMessage = await this.inbox.toggleReaction(messageId, userId, body.emoji.trim());
    return updatedMessage;
  }

  /**
   * POST /api/inbox/messages/:id/pin
   * Pin a message (max 5 per conversation)
   */
  @Post('messages/:id/pin')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.pin')
  async pinMessage(@Param('id') messageId: string, @Body() body: { order?: number }, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    try {
      const pinnedMessage = await this.inbox.pinMessage(messageId, userId, body.order);
      
      // Emit WS event
      if (pinnedMessage.conversation_id) {
        // Import WsGateway if needed - will add later in PR9
        // For now, message.pinned event will be handled separately
      }

      return pinnedMessage;
    } catch (err: any) {
      if (err.message.includes('Maximum 5 pinned messages')) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /**
   * DELETE /api/inbox/messages/:id/pin
   * Unpin a message
   */
  @Delete('messages/:id/pin')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.pin')
  async unpinMessage(@Param('id') messageId: string, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    const unpinnedMessage = await this.inbox.unpinMessage(messageId);
    return unpinnedMessage;
  }

  /**
   * GET /api/inbox/conversations/:id/pinned
   * Get pinned messages for conversation (top 5)
   */
  @Get('conversations/:id/pinned')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async getPinnedMessages(@Param('id') conversationId: string) {
    const pinned = await this.inbox.getPinnedMessages(conversationId);
    return pinned;
  }

  /**
   * GET /api/inbox/conversations/:id/media
   * Get media messages with cursor-based pagination
   */
  @Get('conversations/:id/media')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async getMediaMessages(
    @Param('id') conversationId: string,
    @Query('kind') kind: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitStr?: string
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    if (!kind || !['image', 'video', 'file', 'sticker'].includes(kind)) {
      throw new BadRequestException('Invalid kind parameter');
    }

    const result = await this.inbox.getMediaMessages(conversationId, kind, cursor, limit);
    return result;
  }

  /**
   * GET /api/inbox/users/online
   * Get list of online user IDs
   */
  @Get('users/online')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async getOnlineUsers() {
    const online = await this.presence.getOnlineUsers();
    return { user_ids: online };
  }

  /**
   * GET /api/inbox/conversations/:id/participants/status
   * Get online status of participants in conversation
   */
  @Get('conversations/:id/participants/status')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async getParticipantsStatus(@Param('id') conversationId: string) {
    // Get conversation to find sender
    const conv = await this.inbox.getConversation(conversationId);
    if (!conv) {
      throw new BadRequestException('Conversation not found');
    }

    // For now, return sender status (can be extended for group chats)
    const statuses: any[] = [];
    if (conv.sender_id) {
      const isOnline = await this.presence.isOnline(conv.sender_id);
      const lastSeen = await this.presence.getLastSeen(conv.sender_id);
      statuses.push({
        user_id: conv.sender_id,
        is_online: isOnline,
        last_seen: lastSeen?.toISOString() || null
      });
    }

    return { participants: statuses };
  }

  /**
   * POST /api/inbox/conversations/:id/mute
   * Mute conversation
   */
  @Post('conversations/:id/mute')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.mute')
  async muteConversation(
    @Param('id') conversationId: string,
    @Body() body: { until?: string },
    @Req() req: any
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    const until = body.until ? new Date(body.until) : undefined;
    const settings = await this.settings.muteConversation(conversationId, userId, until);
    return settings;
  }

  /**
   * POST /api/inbox/conversations/:id/unmute
   * Unmute conversation
   */
  @Post('conversations/:id/unmute')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.mute')
  async unmuteConversation(@Param('id') conversationId: string, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    await this.settings.unmuteConversation(conversationId, userId);
    return { success: true };
  }

  /**
   * GET /api/inbox/conversations/:id/settings
   * Get conversation settings for current user
   */
  @Get('conversations/:id/settings')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async getSettings(@Param('id') conversationId: string, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    const settings = await this.settings.getSettings(conversationId, userId);
    return settings;
  }

  /**
   * GET /api/inbox/conversations/:id/profile
   * Get conversation profile
   */
  @Get('conversations/:id/profile')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.profile.read')
  async getProfile(@Param('id') conversationId: string) {
    const conv = await this.inbox.getConversation(conversationId);
    if (!conv) {
      throw new BadRequestException('Conversation not found');
    }

    // Get message stats
    const stats = await this.inbox.getConversationStats(conversationId);

    // Get presence if sender_id exists
    let presence = null;
    if (conv.sender_id) {
      const isOnline = await this.presence.isOnline(conv.sender_id);
      const lastSeen = await this.presence.getLastSeen(conv.sender_id);
      presence = {
        is_online: isOnline,
        last_seen: lastSeen?.toISOString() || null
      };
    }

    return {
      sender_id: conv.sender_id,
      sender_first_name: conv.sender_first_name,
      sender_last_name: conv.sender_last_name,
      sender_username: conv.sender_username,
      sender_phone: conv.sender_phone,
      sender_photo_url: conv.sender_photo_url,
      sender_bio: conv.sender_bio,
      sender_verified: conv.sender_verified || false,
      presence,
      stats
    };
  }

  /**
   * PUT /api/inbox/conversations/:id/profile
   * Update conversation profile (admin only)
   */
  @Put('conversations/:id/profile')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.profile.manage')
  async updateProfile(
    @Param('id') conversationId: string,
    @Body() body: { sender_photo_url?: string; sender_bio?: string; sender_verified?: boolean },
    @Req() req: any
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    // Check if user has admin role (simplified check)
    const ep = await this.authz.getEffectivePermissions(userId);
    if (!ep || !ep.permissions.includes('inbox.profile.manage')) {
      throw new BadRequestException('Only admins can update profiles');
    }

    await this.inbox.updateConversation(conversationId, {
      sender_photo_url: body.sender_photo_url,
      sender_bio: body.sender_bio,
      sender_verified: body.sender_verified
    });

    return { success: true };
  }
}











