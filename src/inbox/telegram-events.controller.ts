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
  Get,
} from '@nestjs/common';
import { InboxService } from './inbox.service';
import { WsGateway } from './ws.gateway';
import { Public } from '../auth/public.decorator';

// Guard to verify SERVICE_JWT
@Injectable()
class ServiceJwtGuard implements CanActivate {
  private readonly logger = new Logger('ServiceJwtGuard');

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('❌ Missing or invalid Authorization header');
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);
    const expectedToken = process.env.SERVICE_JWT;

    if (!expectedToken || token !== expectedToken) {
      this.logger.warn('❌ Invalid service token');
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
  senderPhone?: string | null;
  senderUsername?: string | null;
  senderFirstName?: string | null;
  senderLastName?: string | null;
  chatTitle!: string;
  text!: string;
  attachments?: any[];
  timestamp!: number;
  telegramPeerId?: string;
  raw?: any;
}

@Controller('inbox/events')
export class TelegramEventsController {
  private readonly logger = new Logger(TelegramEventsController.name);

  constructor(
    private readonly inboxService: InboxService,
    private readonly wsGateway: WsGateway
  ) {}

  @Public() // Bypass global JwtAuthGuard - this is for service-to-service auth
  @Post('telegram')
  @UseGuards(ServiceJwtGuard)
  async handleTelegramEvent(@Body() event: any) {
    this.logger.log(`📨 Received Telegram event from chat ${event.chatId}`);
    this.logger.log(`📋 Event data: chatTitle="${event.chatTitle}", telegramPeerId=${event.telegramPeerId ? 'present' : 'null'}, senderName="${event.senderName}"`);

    try {
      // Find or create conversation thread
      // ВСЕГДА передаем все параметры, даже если null/undefined, чтобы обновить если есть
      const thread = await this.inboxService.findOrCreateThread({
        channel_id: `telegram:${event.chatId}`,
        external_chat_id: event.chatId,
        platform: 'telegram',
        chat_title: event.chatTitle || null, // Явно передаем null если undefined
        chat_type: event.chatType || 'private',
        telegram_peer_id: event.telegramPeerId || null, // Явно передаем null если undefined
        sender_phone: event.senderPhone || null,
        sender_username: event.senderUsername || null,
        sender_first_name: event.senderFirstName || null,
        sender_last_name: event.senderLastName || null,
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
      this.logger.log(`📊 Thread updated: chat_title="${thread.chat_title}", telegram_peer_id=${thread.telegram_peer_id ? 'present' : 'null'}`);

      // Отправляем WebSocket событие всем подключенным клиентам
      try {
        await this.wsGateway.emitInboxEvent(thread.id, 'new_message', {
          conversationId: thread.id,
          message: message,
        });
        this.logger.log(`📡 WebSocket event sent for thread ${thread.id}`);
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

  @Public() // Bypass global JwtAuthGuard
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

  @Public() // Bypass global JwtAuthGuard
  @Post('message-status')
  @UseGuards(ServiceJwtGuard)
  async handleMessageStatusUpdate(@Body() payload: { conversationId: string; messageId: string; status: string }) {
    this.logger.log(`📊 Message status update: ${payload.messageId} -> ${payload.status}`);

    try {
      // Отправляем WebSocket событие всем подключенным клиентам
      await this.wsGateway.emitInboxEvent(payload.conversationId, 'message_status_update', {
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        status: payload.status,
      });

      this.logger.log(`📡 WebSocket status update sent for message ${payload.messageId}`);

      return { success: true };
    } catch (error: any) {
      this.logger.error('Error handling message status update:', error);
      throw error;
    }
  }

}







