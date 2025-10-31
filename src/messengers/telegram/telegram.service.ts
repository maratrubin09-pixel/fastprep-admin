import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import { Api } from 'telegram/tl';
import bigInt from 'big-integer';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import { Gauge, register } from 'prom-client';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private client: TelegramClient | null = null;
  private isReady = false;
  
  // Prometheus метрика для статуса подключения
  private readonly connectionStatus: Gauge<string>;

  constructor() {
    this.connectionStatus = new Gauge({
      name: 'telegram_connection_status',
      help: 'Telegram connection status (1=OK, 0=Down)',
      registers: [register],
    });
    // Инициализируем как 0 (не подключено)
    this.connectionStatus.set(0);
  }

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
      this.connectionStatus.set(0); // Установить статус: отключено
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
        this.connectionStatus.set(1); // Установить статус: подключено
        const me = await this.client.getMe();
        this.logger.log(`✅ Telegram connected as: ${me.firstName} ${me.lastName || ''} (@${me.username || 'N/A'})`);

        // Save session
        const session = this.client.session.save() as unknown as string;
        fs.writeFileSync(sessionFile, session, 'utf8');

        // Listen for new messages (только если авторизован!)
        this.client.addEventHandler(this.handleNewMessage.bind(this), new NewMessage({}));
        this.logger.log('👂 Event handler registered for incoming messages');
      } else {
        this.isReady = false;
        this.connectionStatus.set(0); // Установить статус: не подключено
        this.logger.warn(`⚠️ Telegram not authenticated.`);
        this.logger.warn('Run: npm run start:tg-login in Render Shell to authenticate');
      }

    } catch (error) {
      this.logger.error('❌ Failed to initialize Telegram client:', error);
      this.connectionStatus.set(0); // Установить статус: ошибка подключения
    }
  }

  private async handleNewMessage(event: any) {
    try {
      if (!event.message) {
        this.logger.debug('⚠️ Event without message, skipping');
        return;
      }

      const message = event.message;

      // Skip outgoing messages
      if (message.out) {
        this.logger.debug('📤 Skipping outgoing message');
        return;
      }

      this.logger.log(`📨 New incoming message received from chat ${message.chatId}`);
      await this.processIncomingMessage(message);
    } catch (error) {
      this.logger.error('❌ Error handling new message:', error);
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
      let senderPhone = null;
      let senderUsername = null;
      let senderFirstName = null;
      let senderLastName = null;

      if (this.client) {
        try {
          const entity = await this.client.getEntity(chatId);
          chatTitle = (entity as any).title || (entity as any).firstName || 'Unknown';
          
          // Если это личный чат (User), сохраняем информацию о пользователе
          if ((entity as any).className === 'User') {
            senderFirstName = (entity as any).firstName || null;
            senderLastName = (entity as any).lastName || null;
            senderUsername = (entity as any).username || null;
            senderPhone = (entity as any).phone || null;
            senderName = `${senderFirstName || ''} ${senderLastName || ''}`.trim() || 'Unknown';
            chatTitle = senderName; // Для личных чатов используем имя отправителя
          }
        } catch (error) {
          this.logger.warn(`Could not fetch chat info for ${chatId}`);
        }

        // Если senderId есть, но не получили информацию из chat entity, попробуем получить отдельно
        if (senderId && (senderName === 'Unknown' || chatTitle === 'Unknown')) {
          try {
            const sender = await this.client.getEntity(senderId);
            senderFirstName = (sender as any).firstName || null;
            senderLastName = (sender as any).lastName || null;
            senderUsername = (sender as any).username || null;
            senderPhone = (sender as any).phone || null;
            senderName = `${senderFirstName || ''} ${senderLastName || ''}`.trim() || 'Unknown';
            
            // Обновляем chatTitle из senderName, если он был "Unknown"
            if (chatTitle === 'Unknown' && senderName !== 'Unknown') {
              chatTitle = senderName;
            }
            
            this.logger.log(`✅ Extracted sender info: ${senderName} (@${senderUsername || 'N/A'}, ${senderPhone || 'N/A'})`);
          } catch (error) {
            this.logger.warn(`Could not fetch sender info for ${senderId}: ${error}`);
          }
        }
        
        // Если chatTitle все еще "Unknown", но у нас есть информация о sender, используем ее
        if (chatTitle === 'Unknown' && senderName !== 'Unknown') {
          chatTitle = senderName;
        }
      }

      // Сериализуем InputPeer для последующего использования при отправке
      // Берем accessHash напрямую из message._sender (доступен для входящих сообщений)
      // Если не получилось, пытаемся получить entity напрямую
      let peerIdData = null;
      
      // Способ 1: Попробуем из message._sender (быстрее)
      try {
        const sender = message._sender;
        if (sender && sender.id && sender.accessHash) {
          const serialized: any = {
            _: 'InputPeerUser',
            userId: String(sender.id),
            accessHash: String(sender.accessHash)
          };
          
          peerIdData = JSON.stringify(serialized);
          this.logger.log(`📦 Saved InputPeer from message._sender: ${peerIdData}`);
        }
      } catch (error) {
        this.logger.debug(`⚠️ Could not extract InputPeer from message._sender: ${error}`);
      }
      
      // Способ 2: Если не получилось из _sender, получаем entity напрямую через getEntity
      if (!peerIdData && this.client && chatId) {
        try {
          const entity = await this.client.getEntity(chatId);
          
          if ((entity as any).className === 'User') {
            const userId = (entity as any).id;
            const accessHash = (entity as any).accessHash;
            
            if (userId && accessHash) {
              const serialized: any = {
                _: 'InputPeerUser',
                userId: String(userId),
                accessHash: String(accessHash)
              };
              
              peerIdData = JSON.stringify(serialized);
              this.logger.log(`📦 Saved InputPeer from getEntity: ${peerIdData}`);
            } else {
              this.logger.warn(`⚠️ Entity from getEntity missing userId or accessHash`);
            }
          } else if ((entity as any).className === 'Chat') {
            const chatId_ = (entity as any).id;
            const serialized: any = {
              _: 'InputPeerChat',
              chatId: String(chatId_)
            };
            peerIdData = JSON.stringify(serialized);
            this.logger.log(`📦 Saved InputPeerChat from getEntity: ${peerIdData}`);
          } else if ((entity as any).className === 'Channel') {
            const channelId = (entity as any).id;
            const accessHash = (entity as any).accessHash;
            if (channelId && accessHash) {
              const serialized: any = {
                _: 'InputPeerChannel',
                channelId: String(channelId),
                accessHash: String(accessHash)
              };
              peerIdData = JSON.stringify(serialized);
              this.logger.log(`📦 Saved InputPeerChannel from getEntity: ${peerIdData}`);
            }
          }
        } catch (error) {
          this.logger.warn(`⚠️ Could not get entity via getEntity for ${chatId}: ${error}`);
        }
      }
      
      if (!peerIdData) {
        this.logger.error(`❌ Could not save InputPeer for chat ${chatId} - messages to this chat will fail!`);
      }

      const payload = {
        platform: 'telegram',
        chatId: String(chatId),
        messageId: String(messageId),
        senderId: senderId ? String(senderId) : null,
        senderName,
        senderPhone,
        senderUsername,
        senderFirstName,
        senderLastName,
        chatTitle,
        text,
        attachments,
        timestamp: message.date * 1000,
        telegramPeerId: peerIdData,
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

  async sendMessage(chatId: string | number, text: string, telegramPeerId?: string | null): Promise<any> {
    if (!this.client || !this.isReady) {
      throw new Error('Telegram client not ready');
    }

    try {
      this.logger.log(`📤 Sending message to chat ${chatId}`);

      let entity;
      
      // Если есть сохраненный InputPeer, используем его (самый надежный способ)
      if (telegramPeerId) {
        try {
          const parsed = JSON.parse(telegramPeerId);
          this.logger.log(`🔧 Reconstructing InputPeer: ${parsed._}`);
          
          // Воссоздаем InputPeer из сохраненных данных
          if (parsed._ === 'InputPeerUser') {
            entity = new Api.InputPeerUser({
              userId: bigInt(parsed.userId),
              accessHash: bigInt(parsed.accessHash || '0'),
            });
          } else if (parsed._ === 'InputPeerChat') {
            entity = new Api.InputPeerChat({
              chatId: bigInt(parsed.chatId),
            });
          } else if (parsed._ === 'InputPeerChannel') {
            entity = new Api.InputPeerChannel({
              channelId: bigInt(parsed.channelId),
              accessHash: bigInt(parsed.accessHash || '0'),
            });
          } else {
            throw new Error(`Unknown InputPeer type: ${parsed._}`);
          }
          
          this.logger.log(`✅ Reconstructed InputPeer successfully`);
        } catch (error) {
          this.logger.warn(`⚠️ Failed to reconstruct InputPeer, falling back to getEntity: ${error}`);
          entity = await this.client.getEntity(chatId);
        }
      } else {
        // Fallback: пытаемся получить entity напрямую
        this.logger.warn(`⚠️ No saved InputPeer, trying getEntity for ${chatId}`);
        try {
          entity = await this.client.getEntity(chatId);
          this.logger.log(`✅ Successfully got entity via getEntity`);
          
          // Если получили entity, попробуем сохранить InputPeer для будущего использования
          // (опционально, можно передать обратно в БД)
          if (entity && (entity as any).className === 'User') {
            const userId = (entity as any).id;
            const accessHash = (entity as any).accessHash;
            this.logger.log(`💡 Entity info: userId=${userId}, accessHash=${accessHash}`);
          }
        } catch (getEntityError: any) {
          this.logger.error(`❌ Failed to get entity via getEntity for ${chatId}: ${getEntityError.message}`);
          throw new Error(`Cannot resolve chat entity: ${getEntityError.message}. Need valid telegramPeerId for this chat.`);
        }
      }
      
      if (!entity) {
        throw new Error('Failed to resolve entity for sending message');
      }
      
      const result = await this.client.sendMessage(entity, {
        message: text,
      });

      this.logger.log(`✅ Message sent successfully: ${result.id}`);
      return result;
    } catch (error: any) {
      this.logger.error(`❌ Failed to send message to ${chatId}:`, error);
      this.logger.error(`Error details: ${error.message || JSON.stringify(error)}`);
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







