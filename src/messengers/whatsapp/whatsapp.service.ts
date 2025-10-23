import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client, LocalAuth } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';

interface WhatsAppSession {
  client: Client;
  status: 'initializing' | 'qr_ready' | 'authenticated' | 'ready' | 'disconnected';
  qrCode?: string;
  accountInfo?: any;
  createdAt: Date;
}

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private sessions = new Map<string, WhatsAppSession>();

  async onModuleInit() {
    console.log('WhatsAppService initialized');
  }

  async initConnection(userId: string, data: any) {
    // Check if session already exists
    if (this.sessions.has(userId)) {
      const existingSession = this.sessions.get(userId);
      if (existingSession.status === 'ready') {
        return {
          message: 'Already connected',
          status: 'ready',
          accountInfo: existingSession.accountInfo,
        };
      }
      // If not ready, destroy and recreate
      await this.disconnect(userId);
    }

    // Create new WhatsApp client
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `user_${userId}`,
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
        ],
      },
    });

    const session: WhatsAppSession = {
      client,
      status: 'initializing',
      createdAt: new Date(),
    };

    this.sessions.set(userId, session);

    // Set up event handlers
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('QR code generation timeout'));
      }, 60000); // 60 second timeout

      client.on('qr', async (qr) => {
        try {
          console.log(`QR code generated for user ${userId}`);
          const qrCodeDataUrl = await qrcode.toDataURL(qr);
          session.qrCode = qrCodeDataUrl;
          session.status = 'qr_ready';
          
          clearTimeout(timeout);
          resolve({
            sessionId: userId,
            qrCode: qrCodeDataUrl,
            message: 'Scan this QR code with WhatsApp on your phone',
            status: 'qr_ready',
          });
        } catch (err) {
          console.error('Error generating QR code:', err);
          reject(err);
        }
      });

      client.on('authenticated', () => {
        console.log(`WhatsApp authenticated for user ${userId}`);
        session.status = 'authenticated';
      });

      client.on('ready', async () => {
        console.log(`WhatsApp ready for user ${userId}`);
        session.status = 'ready';
        
        // Get account info
        const info = client.info;
        session.accountInfo = {
          phoneNumber: info.wid.user,
          pushname: info.pushname,
          platform: info.platform,
        };
      });

      client.on('disconnected', (reason) => {
        console.log(`WhatsApp disconnected for user ${userId}:`, reason);
        session.status = 'disconnected';
        this.sessions.delete(userId);
      });

      client.on('auth_failure', (msg) => {
        console.error(`WhatsApp auth failure for user ${userId}:`, msg);
        session.status = 'disconnected';
        clearTimeout(timeout);
        reject(new Error('Authentication failed'));
      });

      // Initialize the client
      client.initialize().catch((err) => {
        console.error('Error initializing WhatsApp client:', err);
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async getQrCode(userId: string) {
    const session = this.sessions.get(userId);
    if (!session) {
      throw new Error('No active session found. Please initiate connection first.');
    }

    if (!session.qrCode) {
      throw new Error('QR code not yet generated. Please wait...');
    }

    return session.qrCode;
  }

  async verifyConnection(userId: string) {
    const session = this.sessions.get(userId);
    if (!session) return false;

    return session.status === 'ready';
  }

  async getAccountInfo(userId: string) {
    const session = this.sessions.get(userId);
    if (!session || !session.accountInfo) {
      throw new Error('No account info available');
    }

    return session.accountInfo;
  }

  async disconnect(userId: string) {
    const session = this.sessions.get(userId);
    if (session && session.client) {
      try {
        await session.client.destroy();
      } catch (err) {
        console.error('Error destroying WhatsApp client:', err);
      }
    }
    this.sessions.delete(userId);
  }

  async sendMessage(userId: string, to: string, message: string) {
    const session = this.sessions.get(userId);
    if (!session || session.status !== 'ready') {
      throw new Error('WhatsApp not connected');
    }

    try {
      const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
      const result = await session.client.sendMessage(chatId, message);
      return { 
        success: true, 
        messageId: result.id.id,
        timestamp: result.timestamp,
      };
    } catch (err) {
      console.error('Error sending WhatsApp message:', err);
      throw new Error('Failed to send message');
    }
  }

  async getMessages(userId: string, chatId: string) {
    const session = this.sessions.get(userId);
    if (!session || session.status !== 'ready') {
      throw new Error('WhatsApp not connected');
    }

    try {
      const chat = await session.client.getChatById(chatId);
      const messages = await chat.fetchMessages({ limit: 50 });
      
      return messages.map(msg => ({
        id: msg.id.id,
        from: msg.from,
        to: msg.to,
        body: msg.body,
        timestamp: msg.timestamp,
        fromMe: msg.fromMe,
      }));
    } catch (err) {
      console.error('Error fetching WhatsApp messages:', err);
      return [];
    }
  }

  async getStatus(userId: string) {
    const session = this.sessions.get(userId);
    if (!session) {
      return {
        connected: false,
        status: 'disconnected',
      };
    }

    return {
      connected: session.status === 'ready',
      status: session.status,
      accountInfo: session.accountInfo,
    };
  }
}

