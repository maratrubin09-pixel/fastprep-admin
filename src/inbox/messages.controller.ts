import { Controller, Get, Post, Delete, Param, Body, BadRequestException, Req, UseGuards } from '@nestjs/common';
import { IsString, IsOptional } from 'class-validator';
import { S3Service } from '../storage/s3.service';
import { InboxService } from './inbox.service';
import { PepGuard, RequirePerm } from '../authz/pep.guard';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'video/mp4'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

class SendMessageDto {
  @IsString()
  text!: string;
  
  @IsOptional()
  @IsString()
  objectKey?: string;
}

@Controller('inbox')
export class MessagesController {
  constructor(
    private s3: S3Service,
    private inbox: InboxService
  ) {}

  /**
   * GET /api/inbox/conversations
   * Get all conversations for the current user
   */
  @Get('conversations')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async getConversations(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }
    
    return await this.inbox.getAllConversations();
  }

  /**
   * GET /api/inbox/conversations/:id/messages
   * Get all messages for a conversation
   */
  @Get('conversations/:id/messages')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async getMessages(@Param('id') threadId: string, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }
    
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

      if (head.contentType && !ALLOWED_TYPES.includes(head.contentType)) {
        throw new BadRequestException({ code: 'TYPE_NOT_ALLOWED', message: 'Attachment type not allowed' });
      }

      if (head.size && head.size > MAX_SIZE) {
        throw new BadRequestException({ code: 'SIZE_EXCEEDED', message: 'Attachment size exceeds limit' });
      }
    }

    // Создание сообщения + outbox + audit (возвращает полные данные сообщения)
    const message = await this.inbox.createOutgoingMessage(threadId, userId, dto.text, dto.objectKey);

    // Возвращаем 201 Created с полными данными сообщения
    return message;
  }

  /**
   * DELETE /api/inbox/conversations/:id
   * Удалить чат (для ручного удаления "Unknown" чатов)
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









