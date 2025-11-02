import { Controller, Get, Post, Put, Delete, Param, Body, Query, BadRequestException, Req, UseGuards, Inject, forwardRef } from '@nestjs/common';
import { IsString, IsOptional } from 'class-validator';
import { S3Service } from '../storage/s3.service';
import { InboxService } from './inbox.service';
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
  text!: string;
  
  @IsOptional()
  @IsString()
  objectKey?: string;
  
  @IsOptional()
  @IsString()
  replyTo?: string; // UUID сообщения, на которое отвечаем
}

@Controller('inbox')
export class MessagesController {
  constructor(
    private s3: S3Service,
    private inbox: InboxService,
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

    // Создание сообщения + outbox + audit (возвращает полные данные сообщения)
    console.log(`📤 Creating outgoing message: threadId=${threadId}, userId=${userId}, hasObjectKey=${!!dto.objectKey}, replyTo=${dto.replyTo || 'null'}`);
    console.log(`📤 Full DTO received:`, JSON.stringify({ text: dto.text, objectKey: dto.objectKey, replyTo: dto.replyTo, textLength: dto.text?.length || 0 }));
    const message = await this.inbox.createOutgoingMessage(threadId, userId, dto.text, dto.objectKey, dto.replyTo);
    console.log(`✅ Outgoing message created successfully: messageId=${message.id}, hasObjectKey=${!!message.object_key}, objectKey=${message.object_key || 'null'}`);

    // Возвращаем 201 Created с полными данными сообщения
    // Явно добавляем object_key и objectKey для совместимости с frontend
    return {
      ...message,
      object_key: message.object_key,
      objectKey: message.object_key, // camelCase для совместимости
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
}











