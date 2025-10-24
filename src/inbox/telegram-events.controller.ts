import {
  Controller,
  Post,
  Body,
  UseGuards,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InboxService } from './inbox.service';

// Guard to verify SERVICE_JWT
@Injectable()
class ServiceJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);
    const expectedToken = process.env.SERVICE_JWT;

    if (!expectedToken || token !== expectedToken) {
      throw new UnauthorizedException('Invalid service token');
    }

    return true;
  }
}

class TelegramEventDto {
  platform!: string;
  chatId!: string;
  messageId!: string;
  senderId?: string | null;
  senderName!: string;
  chatTitle!: string;
  text!: string;
  attachments?: any[];
  timestamp!: number;
  raw?: any;
}

@Controller('inbox/events')
export class TelegramEventsController {
  private readonly logger = new Logger(TelegramEventsController.name);

  constructor(private readonly inboxService: InboxService) {}

  @Post('telegram')
  @UseGuards(ServiceJwtGuard)
  async handleTelegramEvent(@Body() event: TelegramEventDto) {
    this.logger.log(`📨 Received Telegram event from chat ${event.chatId}`);

    try {
      // Find or create conversation thread
      const thread = await this.inboxService.findOrCreateThread({
        channel_id: `telegram:${event.chatId}`,
        external_chat_id: event.chatId,
        platform: 'telegram',
      });

      // Save incoming message
      const message = await this.inboxService.createMessage({
        conversation_id: thread.id,
        direction: 'in',
        text: event.text,
        external_message_id: event.messageId,
        sender_name: event.senderName,
        metadata: {
          platform: 'telegram',
          chatTitle: event.chatTitle,
          senderId: event.senderId,
          attachments: event.attachments,
          timestamp: event.timestamp,
        },
      });

      this.logger.log(`✅ Message ${message.id} saved to thread ${thread.id}`);

      // Notify WebSocket clients (if gateway is available)
      try {
        // This would be handled by InboxGateway if it exists
        // await this.inboxGateway.notifyNewMessage(thread.id, message);
      } catch (error) {
        this.logger.warn('Could not notify WebSocket clients:', error);
      }

      return {
        success: true,
        threadId: thread.id,
        messageId: message.id,
      };
    } catch (error: any) {
      this.logger.error('Error handling Telegram event:', error);
      throw error;
    }
  }

  @Post('telegram/status')
  @UseGuards(ServiceJwtGuard)
  async handleTelegramStatus(@Body() status: { messageId: string; status: string; error?: any }) {
    this.logger.log(`📊 Telegram message status update: ${status.messageId} -> ${status.status}`);

    try {
      // Update message delivery status in database
      await this.inboxService.updateMessageStatus(status.messageId, status.status);

      return { success: true };
    } catch (error: any) {
      this.logger.error('Error updating message status:', error);
      throw error;
    }
  }
}

