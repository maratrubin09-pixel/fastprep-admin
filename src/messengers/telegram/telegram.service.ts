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
      
      const text = message.text || '[Media]';
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
    this.logger.log('🔐 Initializing Telegram QR login for user:', userId);
    
    const apiId = parseInt(process.env.TG_API_ID || '0', 10);
    const apiHash = process.env.TG_API_HASH || '';

    if (!apiId || !apiHash) {
      throw new Error('TG_API_ID or TG_API_HASH not configured');
    }

    try {
      // Create a new temporary client for QR login
      const stringSession = new StringSession('');
      const tempClient = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
      });

      await tempClient.connect();

      // Generate QR login token
      const qrLogin = await tempClient.signInUserWithQrCode(
        { apiId, apiHash },
        {
          onError: (err: Error) => {
            this.logger.error('QR Login error:', err);
          },
          qrCode: async (code: { token: Buffer; expires: number }) => {
            // This callback is called when QR code is ready
            // We'll handle it in getQrCode method
            return;
          },
        }
      );

      return {
        success: true,
        message: 'QR code generation started',
      };
    } catch (error) {
      this.logger.error('Failed to init QR login:', error);
      throw error;
    }
  }

  async getQrCode(userId: string): Promise<any> {
    this.logger.log('📱 Generating Telegram QR code for user:', userId);
    
    const apiId = parseInt(process.env.TG_API_ID || '0', 10);
    const apiHash = process.env.TG_API_HASH || '';

    if (!apiId || !apiHash) {
      throw new Error('TG_API_ID or TG_API_HASH not configured');
    }

    try {
      // Create a temporary client for QR code
      const stringSession = new StringSession('');
      const tempClient = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
      });

      await tempClient.connect();

      // Generate QR login URL
      let qrCodeUrl = '';
      
      await tempClient.signInUserWithQrCode(
        { apiId, apiHash },
        {
          onError: (err: Error) => {
            this.logger.error('QR code error:', err);
          },
          qrCode: async (code: { token: Buffer; expires: number }) => {
            // Convert token to base64url format
            const tokenStr = code.token.toString('base64')
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=/g, '');
            
            qrCodeUrl = `tg://login?token=${tokenStr}`;
            this.logger.log('📱 QR code generated, expires:', new Date(code.expires * 1000));
          },
        }
      );

      // Wait a bit for QR code to be generated
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!qrCodeUrl) {
        throw new Error('Failed to generate QR code URL');
      }

      return {
        qrCode: qrCodeUrl,
        expiresIn: 60, // QR codes typically expire in 60 seconds
      };
    } catch (error) {
      this.logger.error('Failed to get QR code:', error);
      throw error;
    }
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
