import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private client: TelegramClient | null = null;
  private isReady = false;

  async onModuleInit() {
    // Only initialize persistent client in Worker (not API)
    // API will create temporary clients for QR code generation
    const isWorker = process.env.IS_WORKER === 'true';
    if (isWorker) {
      await this.initializeClient();
    } else {
      this.logger.log('⏭️ Skipping Telegram client initialization in API (Worker only)');
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.disconnect();
      this.logger.log('🔌 Telegram client disconnected');
    }
  }

  private async initializeClient() {
    const apiId = parseInt(process.env.TG_API_ID || '0', 10);
    const apiHash = process.env.TG_API_HASH || '';
    const tdlibDir = process.env.TDLIB_DIR || '/var/data/tdlib';
    const sessionFile = path.join(tdlibDir, 'session.txt');

    if (!apiId || !apiHash) {
      this.logger.warn('⚠️ TG_API_ID or TG_API_HASH not set. Telegram integration disabled.');
      return;
    }

    try {
      this.logger.log('🔐 Initializing Telegram client...');
      this.logger.log(`📁 Session file: ${sessionFile}`);

      // Ensure directory exists
      if (!fs.existsSync(tdlibDir)) {
        fs.mkdirSync(tdlibDir, { recursive: true });
      }

      // Load session if exists
      let sessionString = '';
      if (fs.existsSync(sessionFile)) {
        sessionString = fs.readFileSync(sessionFile, 'utf8');
        this.logger.log('📂 Loaded existing session');
      }

      const stringSession = new StringSession(sessionString);

      this.client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
      });

      await this.client.connect();

      // Check if authorized
      const authorized = await this.client.isUserAuthorized();
      
      if (authorized) {
        this.isReady = true;
        const me = await this.client.getMe();
        this.logger.log(`✅ Telegram connected as: ${me.firstName} ${me.lastName || ''} (@${me.username || 'N/A'})`);

        // Save session
        const session = this.client.session.save() as unknown as string;
        fs.writeFileSync(sessionFile, session, 'utf8');
      } else {
        this.logger.warn(`⚠️ Telegram not authenticated.`);
        this.logger.warn('Run: npm run start:tg-login in Render Shell to authenticate');
      }

      // Listen for new messages
      this.client.addEventHandler(this.handleNewMessage.bind(this), new NewMessage({}));

    } catch (error) {
      this.logger.error('❌ Failed to initialize Telegram client:', error);
    }
  }

  private async handleNewMessage(event: any) {
    try {
      if (!event.message) {
        return;
      }

      const message = event.message;

      // Skip outgoing messages
      if (message.out) {
        return;
      }

      await this.processIncomingMessage(message);
    } catch (error) {
      this.logger.error('Error handling new message:', error);
    }
  }

  private async processIncomingMessage(message: any) {
    try {
      const chatId = message.chatId || message.peerId?.userId;
      const messageId = message.id;
      const senderId = message.senderId?.userId;
      
      // Debug: log the message structure
      this.logger.debug(`📋 Raw message structure: ${JSON.stringify({
        text: message.text,
        message: message.message,
        type: typeof message.text,
        keys: Object.keys(message)
      })}`);
      
      const text = message.message || message.text || '[Media]';
      const attachments: any[] = [];

      // Get chat info
      let chatTitle = 'Unknown';
      let senderName = 'Unknown';

      if (this.client) {
        try {
          const entity = await this.client.getEntity(chatId);
          chatTitle = (entity as any).title || (entity as any).firstName || 'Unknown';
        } catch (error) {
          this.logger.warn(`Could not fetch chat info for ${chatId}`);
        }

        if (senderId) {
          try {
            const sender = await this.client.getEntity(senderId);
            senderName = `${(sender as any).firstName} ${(sender as any).lastName || ''}`.trim();
          } catch (error) {
            this.logger.warn(`Could not fetch sender info for ${senderId}`);
          }
        }
      }

      const payload = {
        platform: 'telegram',
        chatId: String(chatId),
        messageId: String(messageId),
        senderId: senderId ? String(senderId) : null,
        senderName,
        chatTitle,
        text,
        attachments,
        timestamp: message.date * 1000,
        raw: message,
      };

      this.logger.log(`📨 Incoming Telegram message from ${senderName} in ${chatTitle}`);
      this.logger.debug(`📤 Payload text field: "${text}" (type: ${typeof text})`);

      // Send to backend API
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      const serviceJwt = process.env.SERVICE_JWT;

      if (!serviceJwt) {
        this.logger.error('❌ SERVICE_JWT not set. Cannot forward message to backend.');
        return;
      }

      const url = `${backendUrl}/api/inbox/events/telegram`;
      this.logger.debug(`📡 Sending to: ${url}`);
      this.logger.debug(`🔑 Service JWT (first 10 chars): ${serviceJwt.substring(0, 10)}...`);

      await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${serviceJwt}`,
          'Content-Type': 'application/json',
        },
      });

      this.logger.debug(`✅ Message forwarded to backend API`);
    } catch (error: any) {
      this.logger.error('❌ Error processing incoming message:', error.message);
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}`);
        this.logger.error(`Response data:`, error.response.data);
      }
    }
  }

  async sendMessage(chatId: string | number, text: string): Promise<any> {
    if (!this.client || !this.isReady) {
      throw new Error('Telegram client not ready');
    }

    try {
      this.logger.log(`📤 Sending message to chat ${chatId}`);

      const result = await this.client.sendMessage(Number(chatId), {
        message: text,
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
      const me = await this.client.getMe();
      return {
        connected: true,
        username: (me as any).username || undefined,
      };
    } catch (error) {
      return { connected: false };
    }
  }

  // Stub methods for compatibility with MessengersService
  async initConnection(userId: string, data?: Record<string, unknown>): Promise<any> {
    this.logger.warn('⚠️ initConnection called for Telegram - manual setup required');
    return {
      success: false,
      message: 'Telegram requires manual authentication via telegram-login script',
      instructions: 'Run: npm run start:tg-login in Render Shell',
    };
  }

  async getQrCode(userId: string): Promise<any> {
    this.logger.warn('⚠️ Telegram QR authentication not fully implemented yet');
    
    // For now, return instructions to use telegram-login script in Render Shell
    throw new Error(
      'Telegram authentication requires manual setup. ' +
      'Please contact administrator to run: npm run start:tg-login in Render Shell'
    );
  }

  async verifyConnection(userId: string): Promise<boolean> {
    return this.isReady;
  }

  async getAccountInfo(userId: string): Promise<any> {
    if (!this.client || !this.isReady) {
      return null;
    }

    try {
      const me = await this.client.getMe();
      return {
        id: (me as any).id,
        firstName: (me as any).firstName,
        lastName: (me as any).lastName || '',
        username: (me as any).username || '',
        phoneNumber: (me as any).phone || '',
      };
    } catch (error) {
      this.logger.error('Failed to get account info:', error);
      return null;
    }
  }

  async disconnect(userId: string): Promise<void> {
    this.logger.log('🔌 Disconnect requested - closing Telegram client');
    if (this.client) {
      await this.client.disconnect();
      this.isReady = false;
    }
  }
}
