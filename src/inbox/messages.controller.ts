import { Controller, Post, Param, Body, BadRequestException, Req, UseGuards } from '@nestjs/common';
import { S3Service } from '../storage/s3.service';
import { InboxService } from './inbox.service';
import { PepGuard, RequirePerm } from '../authz/pep.guard';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'video/mp4'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

class SendMessageDto {
  text!: string;
  objectKey?: string;
}

@Controller('inbox/threads')
export class MessagesController {
  constructor(
    private s3: S3Service,
    private inbox: InboxService
  ) {}

  /**
   * POST /api/inbox/threads/:id/messages
   * Валидация objectKey (HEAD: существует, допустимый MIME/размер, префикс inbox/{threadId}/)
   * Транзакция: messages (out, delivery_status='queued') → outbox (pending) → audit_logs
   */
  @Post(':id/messages')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.send_message')
  async sendMessage(@Param('id') threadId: string, @Body() dto: SendMessageDto, @Req() req: any) {
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

    // Создание сообщения + outbox + audit
    const messageId = await this.inbox.createOutgoingMessage(threadId, userId, dto.text, dto.objectKey);

    return { status: 'queued', messageId };
  }
}


