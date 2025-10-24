import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Client } from 'tdl';
import { getTdjson } from 'prebuilt-tdlib';
import axios from 'axios';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private client: Client | null = null;
  private isReady = false;

  async onModuleInit() {
    await this.initializeClient();
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.close();
      this.logger.log('🔌 Telegram client closed');
    }
  }

  private async initializeClient() {
    const apiId = parseInt(process.env.TG_API_ID || '0', 10);
    const apiHash = process.env.TG_API_HASH || '';
    const tdlibDir = process.env.TDLIB_DIR || '/var/data/tdlib';
    const encryptionKey = process.env.TDLIB_ENCRYPTION_KEY || '';

    if (!apiId || !apiHash) {
      this.logger.warn('⚠️ TG_API_ID or TG_API_HASH not set. Telegram integration disabled.');
      return;
    }

    if (!encryptionKey) {
      this.logger.warn('⚠️ TDLIB_ENCRYPTION_KEY not set. Telegram integration disabled.');
      return;
    }

    try {
      this.logger.log('🔐 Initializing Telegram client...');
      this.logger.log(`📁 Session directory: ${tdlibDir}`);

      this.client = new Client(getTdjson(), {
        apiId,
        apiHash,
        databaseDirectory: `${tdlibDir}/db`,
        filesDirectory: `${tdlibDir}/files`,
        databaseEncryptionKey: encryptionKey,
        useTestDc: false,
      });

      this.client.on('error', (err) => {
        this.logger.error('❌ TDLib Error:', err);
      });

      this.client.on('update', async (update) => {
        await this.handleUpdate(update);
      });

      await this.client.connect();

      // Wait for authorization
      const authState = await this.client.invoke({ _: 'getAuthorizationState' });
      
      if (authState._ === 'authorizationStateReady') {
        this.isReady = true;
        const me = await this.client.invoke({ _: 'getMe' });
        this.logger.log(`✅ Telegram connected as: ${me.first_name} ${me.last_name || ''} (@${me.username || 'N/A'})`);
      } else {
        this.logger.warn(`⚠️ Telegram not authenticated. Current state: ${authState._}`);
        this.logger.warn('Run: npm run start:tg-login in Render Shell to authenticate');
      }
    } catch (error) {
      this.logger.error('❌ Failed to initialize Telegram client:', error);
    }
  }

  private async handleUpdate(update: any) {
    try {
      // Handle new messages
      if (update._ === 'updateNewMessage') {
        const message = update.message;
        
        // Skip outgoing messages
        if (message.is_outgoing) {
          return;
        }

        await this.processIncomingMessage(message);
      }

      // Handle message send success
      if (update._ === 'updateMessageSendSucceeded') {
        this.logger.debug(`✅ Message sent successfully: ${update.message.id}`);
        await this.notifyMessageStatus(update.message.id, 'sent', update.message);
      }

      // Handle message send failure
      if (update._ === 'updateMessageSendFailed') {
        this.logger.error(`❌ Message send failed: ${update.message.id}`, update.error);
        await this.notifyMessageStatus(update.message.id, 'failed', null, update.error);
      }

      // Handle authorization state changes
      if (update._ === 'updateAuthorizationState') {
        this.logger.log(`📱 Auth state changed: ${update.authorization_state._}`);
        if (update.authorization_state._ === 'authorizationStateReady') {
          this.isReady = true;
        } else if (update.authorization_state._ === 'authorizationStateClosed') {
          this.isReady = false;
        }
      }
    } catch (error) {
      this.logger.error('Error handling update:', error);
    }
  }

  private async processIncomingMessage(message: any) {
    try {
      const chatId = message.chat_id;
      const messageId = message.id;
      const senderId = message.sender_id?.user_id;
      
      let text = '';
      let attachments: any[] = [];

      // Extract text
      if (message.content?._ === 'messageText') {
        text = message.content.text?.text || '';
      } else if (message.content?._ === 'messagePhoto') {
        text = message.content.caption?.text || '[Photo]';
        attachments.push({
          type: 'photo',
          file_id: message.content.photo?.sizes?.[0]?.photo?.id,
        });
      } else if (message.content?._ === 'messageDocument') {
        text = message.content.caption?.text || '[Document]';
        attachments.push({
          type: 'document',
          file_id: message.content.document?.document?.id,
          file_name: message.content.document?.file_name,
        });
      } else if (message.content?._ === 'messageVoiceNote') {
        text = '[Voice Message]';
        attachments.push({
          type: 'voice',
          file_id: message.content.voice_note?.voice?.id,
        });
      } else {
        text = `[${message.content?._}]`;
      }

      // Get chat info
      const chat = await this.client!.invoke({
        _: 'getChat',
        chat_id: chatId,
      });

      // Get sender info if available
      let senderName = 'Unknown';
      if (senderId) {
        try {
          const user = await this.client!.invoke({
            _: 'getUser',
            user_id: senderId,
          });
          senderName = `${user.first_name} ${user.last_name || ''}`.trim();
        } catch (error) {
          this.logger.warn(`Could not fetch user info for ${senderId}`);
        }
      }

      const payload = {
        platform: 'telegram',
        chatId: String(chatId),
        messageId: String(messageId),
        senderId: senderId ? String(senderId) : null,
        senderName,
        chatTitle: chat.title || senderName,
        text,
        attachments,
        timestamp: message.date * 1000, // Convert to milliseconds
        raw: message,
      };

      this.logger.log(`📨 Incoming Telegram message from ${senderName} in ${chat.title || 'private chat'}`);

      // Send to backend API
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      const serviceJwt = process.env.SERVICE_JWT;

      if (!serviceJwt) {
        this.logger.error('❌ SERVICE_JWT not set. Cannot forward message to backend.');
        return;
      }

      await axios.post(`${backendUrl}/api/inbox/events/telegram`, payload, {
        headers: {
          Authorization: `Bearer ${serviceJwt}`,
          'Content-Type': 'application/json',
        },
      });

      this.logger.debug(`✅ Message forwarded to backend API`);
    } catch (error) {
      this.logger.error('Error processing incoming message:', error);
    }
  }

  private async notifyMessageStatus(
    messageId: number,
    status: 'sent' | 'failed',
    message?: any,
    error?: any
  ) {
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      const serviceJwt = process.env.SERVICE_JWT;

      if (!serviceJwt) {
        return;
      }

      await axios.post(
        `${backendUrl}/api/inbox/events/telegram/status`,
        {
          messageId: String(messageId),
          status,
          message,
          error,
        },
        {
          headers: {
            Authorization: `Bearer ${serviceJwt}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error) {
      this.logger.error('Error notifying message status:', error);
    }
  }

  async sendMessage(chatId: string | number, text: string): Promise<any> {
    if (!this.client || !this.isReady) {
      throw new Error('Telegram client not ready');
    }

    try {
      this.logger.log(`📤 Sending message to chat ${chatId}`);

      const result = await this.client.invoke({
        _: 'sendMessage',
        chat_id: Number(chatId),
        input_message_content: {
          _: 'inputMessageText',
          text: {
            _: 'formattedText',
            text,
          },
        },
      });

      this.logger.log(`✅ Message sent: ${result.id}`);
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to send message to ${chatId}:`, error);
      throw error;
    }
  }

  async getStatus(): Promise<{ connected: boolean; username?: string }> {
    if (!this.client || !this.isReady) {
      return { connected: false };
    }

    try {
      const me = await this.client.invoke({ _: 'getMe' });
      return {
        connected: true,
        username: me.username || undefined,
      };
    } catch (error) {
      return { connected: false };
    }
  }
}
