import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import { Api } from 'telegram/tl';
import bigInt from 'big-integer';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Gauge, register } from 'prom-client';
import { S3Service } from '../../storage/s3.service';
import { v4 as uuidv4 } from 'uuid';
import { get } from 'https';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private client: TelegramClient | null = null;
  private isReady = false;
  
  // Prometheus метрика для статуса подключения
  private readonly connectionStatus: Gauge<string>;

  constructor(
    private s3Service: S3Service
  ) {
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
      
      // 🔍 ДИАГНОСТИКА: Логируем исходный message от Telegram API
      this.logger.log(`🔍 DEBUG: Raw message structure - chatId: ${message.chatId}, senderId: ${message.senderId?.userId || 'null'}`);
      this.logger.log(`🔍 DEBUG: message._sender exists: ${!!message._sender}`);
      if (message._sender) {
        this.logger.log(`🔍 DEBUG: message._sender structure: ${JSON.stringify({
          firstName: message._sender.firstName || null,
          lastName: message._sender.lastName || null,
          username: message._sender.username || null,
          phone: message._sender.phone || null,
          className: message._sender.className || null,
        })}`);
      }
      this.logger.log(`🔍 DEBUG: this.client exists: ${!!this.client}, isReady: ${this.isReady}`);
      
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
      
      // Извлекаем текст и медиа из сообщения
      let text = message.message || message.text || '';
      const attachments: any[] = [];
      let objectKey: string | null = null; // S3 ключ для первого медиафайла
      
      // Обработка медиафайлов
      if (message.media && this.client) {
        const media = message.media;
        let mediaType: string | null = null;
        let mimeType: string | null = null;
        let fileName: string | null = null;
        let caption: string | null = null;
        
        // Определяем тип медиа
        if (media.photo || media.className === 'MessageMediaPhoto') {
          mediaType = 'photo';
          mimeType = 'image/jpeg'; // Telegram обычно использует JPEG для фото
          fileName = 'photo.jpg';
          caption = media.caption || text || '';
          if (!text) text = '📷 Photo';
        } else if (media.video || (media.className === 'MessageMediaDocument' && media.mimeType?.startsWith('video/'))) {
          mediaType = 'video';
          mimeType = media.mimeType || 'video/mp4';
          fileName = media.fileName || 'video.mp4';
          caption = media.caption || text || '';
          if (!text) text = '🎥 Video';
        } else if (media.className === 'MessageMediaDocument' && (media.mimeType === 'audio/ogg' || media.mimeType === 'audio/x-voice' || media.voice)) {
          mediaType = 'voice';
          mimeType = media.mimeType || 'audio/ogg';
          fileName = 'voice.ogg';
          caption = text || '';
          if (!text) text = '🎤 Voice message';
        } else if (media.className === 'MessageMediaDocument' && media.mimeType?.startsWith('audio/') && !media.voice) {
          mediaType = 'audio';
          mimeType = media.mimeType;
          fileName = media.fileName || 'audio';
          caption = media.caption || text || '';
          if (!text) text = '🎵 Audio file';
        } else if (media.className === 'MessageMediaDocument' && !media.mimeType?.startsWith('video/') && !media.mimeType?.startsWith('audio/')) {
          mediaType = 'document';
          mimeType = media.mimeType || 'application/octet-stream';
          fileName = media.fileName || 'file';
          caption = media.caption || text || '';
          if (!text) text = '📎 Document';
        } else if (media.sticker || media.className === 'MessageMediaSticker') {
          mediaType = 'sticker';
          mimeType = 'image/webp'; // Stickers обычно в формате WebP
          fileName = 'sticker.webp';
          if (!text) text = '😀 Sticker';
        }
        
        // Сохраняем информацию о медиа в attachments
        if (mediaType) {
          attachments.push({
            type: mediaType,
            media: media,
            caption: caption || '',
            mimeType: mimeType,
            fileName: fileName,
          });
          
          // Скачиваем и загружаем первый медиафайл в S3
          try {
            this.logger.log(`📥 Downloading ${mediaType} from Telegram...`);
            const buffer = await this.client.downloadMedia(message, {});
            
            if (buffer && Buffer.isBuffer(buffer)) {
              // Генерируем S3 ключ (используем chatId, threadId будет известен после создания thread)
              // После создания thread можно будет обновить object_key при необходимости
              const threadPrefix = `inbox/telegram_${chatId}/`;
              const s3Key = await this.uploadMediaToS3(buffer, threadPrefix, fileName!, mimeType!);
              
              if (s3Key) {
                objectKey = s3Key;
                this.logger.log(`✅ Media uploaded to S3: ${objectKey}`);
              } else {
                this.logger.warn(`⚠️ Failed to upload media to S3`);
              }
            } else {
              this.logger.warn(`⚠️ Downloaded media is not a Buffer: ${typeof buffer}`);
            }
          } catch (error: any) {
            this.logger.error(`❌ Error downloading/uploading media: ${error.message}`);
            // Не прерываем обработку сообщения, если медиа не удалось скачать
          }
        }
      }
      
      // Если нет текста и нет медиа, помечаем как медиа
      if (!text) {
        text = '[Media]';
      }

      // Get chat info - улучшенная логика с приоритетами
      let chatTitle = 'Unknown';
      let senderName = 'Unknown';
      let senderPhone = null;
      let senderUsername = null;
      let senderFirstName = null;
      let senderLastName = null;
      let peerIdData = null; // Для сохранения telegramPeerId

      this.logger.log(`🔍 DEBUG: Starting chat info extraction - chatId: ${chatId}, senderId: ${senderId || 'null'}`);

      // Способ 1: Попробуем получить из message._sender (самый быстрый)
      this.logger.log(`🔍 DEBUG: Method 1 - Checking message._sender...`);
      try {
        const sender = message._sender;
        this.logger.log(`🔍 DEBUG: Method 1 - message._sender value: ${sender ? 'exists' : 'null/undefined'}`);
        if (sender) {
          senderFirstName = sender.firstName || null;
          senderLastName = sender.lastName || null;
          senderUsername = sender.username || null;
          senderPhone = sender.phone || null;
          senderName = `${senderFirstName || ''} ${senderLastName || ''}`.trim() || senderUsername || senderPhone || 'Unknown';
          
          this.logger.log(`🔍 DEBUG: Method 1 - Extracted: firstName=${senderFirstName}, lastName=${senderLastName}, username=${senderUsername}, phone=${senderPhone}, senderName=${senderName}`);
          
          if (senderName !== 'Unknown') {
            chatTitle = senderName;
            this.logger.log(`✅ Got sender info from message._sender: ${senderName}`);
          } else {
            this.logger.log(`⚠️ Method 1 - senderName is still Unknown`);
          }
        } else {
          this.logger.log(`⚠️ Method 1 - message._sender is null/undefined`);
        }
      } catch (error) {
        this.logger.warn(`❌ Method 1 - Could not extract from message._sender: ${error}`);
      }

      // Способ 2a: Попробуем получить entity из message._entities (доступно в сообщении)
      if ((chatTitle === 'Unknown' || senderName === 'Unknown') && message._entities) {
        this.logger.log(`🔍 DEBUG: Method 2a - Checking message._entities...`);
        try {
          for (const entity of message._entities || []) {
            if (entity.className === 'User' && entity.id) {
              const userId = String(entity.id);
              if (userId === String(chatId) || userId === String(senderId)) {
                this.logger.log(`🔍 DEBUG: Method 2a - Found User entity: id=${entity.id}, firstName=${entity.firstName}, lastName=${entity.lastName}, username=${entity.username}`);
                if (!senderFirstName && entity.firstName) senderFirstName = entity.firstName;
                if (!senderLastName && entity.lastName) senderLastName = entity.lastName;
                if (!senderUsername && entity.username) senderUsername = entity.username;
                if (!senderPhone && entity.phone) senderPhone = entity.phone;
                
                const name = `${senderFirstName || ''} ${senderLastName || ''}`.trim() || senderUsername || senderPhone;
                if (name && senderName === 'Unknown') {
                  senderName = name;
                  chatTitle = name;
                  this.logger.log(`✅ Method 2a - Got info from _entities: ${senderName}`);
                  break;
                }
              }
            }
          }
        } catch (error: any) {
          this.logger.warn(`❌ Method 2a - Error extracting from _entities: ${error.message || error}`);
        }
      }

      // Способ 2b: Если не получили, пробуем через getEntity для chatId (может не работать для новых чатов)
      if ((chatTitle === 'Unknown' || senderName === 'Unknown') && this.client) {
        this.logger.log(`🔍 DEBUG: Method 2b - Calling getEntity for chatId: ${chatId}`);
        try {
          // Попробуем создать InputPeerUser напрямую, если есть доступная информация
          let entity = null;
          
          // Если в message есть peerId с accessHash, используем его
          if (message.peerId && message.peerId.userId) {
            try {
              entity = new Api.InputPeerUser({
                userId: bigInt(message.peerId.userId),
                accessHash: bigInt(message.peerId.accessHash || '0'),
              });
              this.logger.log(`🔍 DEBUG: Method 2b - Created InputPeerUser from peerId`);
            } catch (e) {
              this.logger.debug(`⚠️ Method 2b - Could not create InputPeerUser from peerId: ${e}`);
            }
          }
          
          // Если не получилось, пробуем стандартный getEntity (может не работать для новых чатов)
          if (!entity) {
            try {
              entity = await this.client.getEntity(chatId);
              this.logger.log(`🔍 DEBUG: Method 2b - getEntity succeeded, entity className: ${(entity as any).className || 'unknown'}`);
            } catch (getEntityError: any) {
              // Для новых чатов getEntity может не работать - это нормально
              this.logger.warn(`⚠️ Method 2b - getEntity failed (expected for new chats): ${getEntityError.message || getEntityError}`);
              // Попробуем получить через getDialogs (список диалогов)
              try {
                this.logger.log(`🔍 DEBUG: Method 2c - Trying getDialogs to find chat ${chatId}...`);
                const dialogs = await this.client.getDialogs({ limit: 200 });
                const foundDialog = dialogs.find((d: any) => {
                  const dId = d.entity?.id?.toString() || d.id?.toString();
                  return dId === String(chatId);
                });
                if (foundDialog && foundDialog.entity) {
                  entity = foundDialog.entity;
                  this.logger.log(`✅ Method 2c - Found in dialogs: className=${(entity as any).className || 'unknown'}`);
                  
                  // Создаем telegramPeerId из найденного entity
                  if (!peerIdData) {
                    if ((entity as any).className === 'User') {
                      const userId = (entity as any).id;
                      const accessHash = (entity as any).accessHash || '0';
                      if (userId) {
                        const serialized: any = {
                          _: 'InputPeerUser',
                          userId: String(userId),
                          accessHash: String(accessHash)
                        };
                        peerIdData = JSON.stringify(serialized);
                        this.logger.log(`✅ Method 2c - Created telegramPeerId from dialog entity: ${peerIdData}`);
                      }
                    } else if ((entity as any).className === 'Chat') {
                      const chatId_ = (entity as any).id;
                      if (chatId_) {
                        const serialized: any = {
                          _: 'InputPeerChat',
                          chatId: String(chatId_)
                        };
                        peerIdData = JSON.stringify(serialized);
                        this.logger.log(`✅ Method 2c - Created telegramPeerId from dialog entity: ${peerIdData}`);
                      }
                    } else if ((entity as any).className === 'Channel') {
                      const channelId = (entity as any).id;
                      const accessHash = (entity as any).accessHash || '0';
                      if (channelId) {
                        const serialized: any = {
                          _: 'InputPeerChannel',
                          channelId: String(channelId),
                          accessHash: String(accessHash)
                        };
                        peerIdData = JSON.stringify(serialized);
                        this.logger.log(`✅ Method 2c - Created telegramPeerId from dialog entity: ${peerIdData}`);
                      }
                    }
                  }
                } else {
                  this.logger.warn(`⚠️ Method 2c - Chat ${chatId} not found in dialogs`);
                }
              } catch (dialogsError: any) {
                this.logger.warn(`⚠️ Method 2c - getDialogs failed: ${dialogsError.message || dialogsError}`);
              }
            }
          }
          
          if (entity) {
            this.logger.log(`🔍 DEBUG: Method 2b - Processing entity, className: ${(entity as any).className || 'unknown'}`);
            const entityTitle = (entity as any).title || (entity as any).firstName || null;
            const entityFirstName = (entity as any).firstName || null;
            const entityLastName = (entity as any).lastName || null;
            const entityUsername = (entity as any).username || null;
            const entityPhone = (entity as any).phone || null;
            
            this.logger.log(`🔍 DEBUG: Method 2b - Entity data: title=${entityTitle}, firstName=${entityFirstName}, lastName=${entityLastName}, username=${entityUsername}, phone=${entityPhone}`);
            
            // Если это личный чат (User), сохраняем информацию о пользователе
            if ((entity as any).className === 'User') {
              // Используем только если еще не получили данные
              if (!senderFirstName) senderFirstName = entityFirstName;
              if (!senderLastName) senderLastName = entityLastName;
              if (!senderUsername) senderUsername = entityUsername;
              if (!senderPhone) senderPhone = entityPhone;
            
              const name = `${senderFirstName || ''} ${senderLastName || ''}`.trim() || senderUsername || senderPhone;
              if (name && senderName === 'Unknown') {
                senderName = name;
                chatTitle = name;
              } else if (entityTitle && chatTitle === 'Unknown') {
                chatTitle = entityTitle;
              }
          } else if (entityTitle && chatTitle === 'Unknown') {
            // Для групповых чатов используем title
            chatTitle = entityTitle;
          }
          
            this.logger.log(`✅ Got entity info: chatTitle=${chatTitle}, senderName=${senderName}`);
          } else {
            this.logger.warn(`⚠️ Method 2b - Could not get entity (new chat or access denied)`);
            }
          } catch (error: any) {
          this.logger.warn(`❌ Method 2b - Could not fetch chat info for ${chatId}: ${error.message || error}`);
          this.logger.warn(`❌ Method 2b - Error details: ${JSON.stringify({ name: error.name, message: error.message, stack: error.stack?.substring(0, 200) })}`);
        }
      } else {
        if (!this.client) {
          this.logger.warn(`⚠️ Method 2 - Skipped: this.client is null/undefined`);
        } else {
          this.logger.log(`⚠️ Method 2 - Skipped: chatTitle=${chatTitle}, senderName=${senderName} (already resolved)`);
        }
      }

      // Способ 3: Если senderId есть, но не получили информацию, пробуем получить sender отдельно
      if (senderId && (senderName === 'Unknown' || chatTitle === 'Unknown') && this.client) {
        this.logger.log(`🔍 DEBUG: Method 3 - Calling getEntity for senderId: ${senderId}`);
        try {
          const sender = await this.client.getEntity(senderId);
          this.logger.log(`🔍 DEBUG: Method 3 - getEntity succeeded, sender className: ${(sender as any).className || 'unknown'}`);
          const fetchedFirstName = (sender as any).firstName || null;
          const fetchedLastName = (sender as any).lastName || null;
          const fetchedUsername = (sender as any).username || null;
          const fetchedPhone = (sender as any).phone || null;
          
          this.logger.log(`🔍 DEBUG: Method 3 - Sender data: firstName=${fetchedFirstName}, lastName=${fetchedLastName}, username=${fetchedUsername}, phone=${fetchedPhone}`);
          
          // Используем только если еще не получили
          if (!senderFirstName) senderFirstName = fetchedFirstName;
          if (!senderLastName) senderLastName = fetchedLastName;
          if (!senderUsername) senderUsername = fetchedUsername;
          if (!senderPhone) senderPhone = fetchedPhone;
          
          const name = `${senderFirstName || ''} ${senderLastName || ''}`.trim() || senderUsername || senderPhone;
          if (name && senderName === 'Unknown') {
            senderName = name;
            if (chatTitle === 'Unknown') {
              chatTitle = senderName;
            }
          }
          
          this.logger.log(`✅ Extracted sender info separately: ${senderName} (@${senderUsername || 'N/A'}, ${senderPhone || 'N/A'})`);
        } catch (error: any) {
          this.logger.warn(`❌ Method 3 - Could not fetch sender info for ${senderId}: ${error.message || error}`);
          this.logger.warn(`❌ Method 3 - Error details: ${JSON.stringify({ name: error.name, message: error.message, stack: error.stack?.substring(0, 200) })}`);
        }
      } else {
        if (!senderId) {
          this.logger.log(`⚠️ Method 3 - Skipped: senderId is null/undefined`);
        } else if (!this.client) {
          this.logger.warn(`⚠️ Method 3 - Skipped: this.client is null/undefined`);
        } else {
          this.logger.log(`⚠️ Method 3 - Skipped: chatTitle=${chatTitle}, senderName=${senderName} (already resolved)`);
        }
      }
      
      // Способ 4: Fallback - используем username, phone или external_chat_id если все еще Unknown
      if (chatTitle === 'Unknown' && senderName === 'Unknown') {
        if (senderUsername) {
          chatTitle = `@${senderUsername}`;
          senderName = `@${senderUsername}`;
        } else if (senderPhone) {
          chatTitle = senderPhone;
          senderName = senderPhone;
        } else if (chatId) {
          chatTitle = `Chat ${chatId}`;
          senderName = `Chat ${chatId}`;
        }
        this.logger.log(`⚠️ Using fallback name: ${chatTitle}`);
      }
      
      // Финальная проверка: если chatTitle все еще Unknown, но senderName есть
      if (chatTitle === 'Unknown' && senderName !== 'Unknown') {
        chatTitle = senderName;
        this.logger.log(`✅ Final check - Updated chatTitle from senderName: ${chatTitle}`);
      }
      
      // 🔍 ДИАГНОСТИКА: Логируем финальное состояние перед передачей в findOrCreateThread
      this.logger.log(`🔍 DEBUG: Final chat info before findOrCreateThread: chatTitle=${chatTitle}, senderName=${senderName}, firstName=${senderFirstName}, lastName=${senderLastName}, username=${senderUsername}, phone=${senderPhone}`);

      // Сериализуем InputPeer для последующего использования при отправке
      // Берем accessHash напрямую из message._sender (доступен для входящих сообщений)
      // Если не получилось, пытаемся получить entity напрямую
      // peerIdData уже объявлен выше (строка 271), может быть установлен в Method 2c
      
      // Способ 1: Попробуем из message._sender (быстрее, наиболее надежный)
      if (!peerIdData) {
        try {
          const sender = message._sender;
          this.logger.debug(`🔍 Checking message._sender: ${sender ? `id=${sender.id}, hasAccessHash=${!!sender.accessHash}` : 'null'}`);
          
          if (sender && sender.id) {
            if (sender.accessHash) {
          const serialized: any = {
            _: 'InputPeerUser',
            userId: String(sender.id),
              accessHash: String(sender.accessHash)
          };
          
          peerIdData = JSON.stringify(serialized);
            this.logger.log(`✅ Saved InputPeer from message._sender: ${peerIdData}`);
        } else {
            this.logger.warn(`⚠️ message._sender exists but no accessHash for userId=${sender.id}`);
          }
        }
        } catch (error) {
          this.logger.warn(`⚠️ Could not extract InputPeer from message._sender: ${error}`);
        }
      }
      
      // Способ 2: Если не получилось из _sender, получаем entity напрямую через getEntity
      if (!peerIdData && this.client && chatId) {
        this.logger.log(`🔍 Trying getEntity for chatId=${chatId} to get InputPeer`);
        try {
          const entity = await this.client.getEntity(chatId);
          this.logger.debug(`✅ Got entity from getEntity: className=${(entity as any).className}, id=${(entity as any).id}, hasAccessHash=${!!(entity as any).accessHash}`);
          
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
        this.logger.error(`❌ Details: senderName=${senderName}, chatTitle=${chatTitle}, hasMessageSender=${!!message._sender}`);
      } else {
        this.logger.log(`✅ Successfully extracted telegramPeerId for chat ${chatId}`);
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
        objectKey, // S3 ключ для медиафайла
        timestamp: message.date * 1000,
        telegramPeerId: peerIdData,
        raw: message,
      };

      this.logger.log(`📨 Incoming Telegram message from ${senderName} in ${chatTitle}`);
      this.logger.log(`📋 Payload summary: chatTitle="${chatTitle}", telegramPeerId=${peerIdData ? 'present' : 'null'}, senderUsername=${senderUsername || 'null'}, senderPhone=${senderPhone || 'null'}`);
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

  private async resolveEntity(chatId: string | number, telegramPeerId?: string | null): Promise<any> {
    if (!this.client || !this.isReady) {
      throw new Error('Telegram client not ready');
    }

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
        return entity;
        } catch (error) {
          this.logger.warn(`⚠️ Failed to reconstruct InputPeer (${error}), falling back to getEntity for ${chatId}`);
        }
      }
      
      // Fallback: пытаемся получить entity напрямую
      if (!entity) {
        this.logger.log(`🔍 No saved InputPeer (telegramPeerId=${telegramPeerId || 'null'}), trying getEntity for ${chatId}`);
        try {
          entity = await this.client.getEntity(chatId);
          this.logger.log(`✅ Successfully got entity via getEntity`);
        } catch (getEntityError: any) {
          // Для новых чатов getEntity может не работать - пробуем через getDialogs
          this.logger.warn(`⚠️ getEntity failed (expected for new chats): ${getEntityError.message}`);
          this.logger.log(`🔍 Method 2c - Trying getDialogs to find chat ${chatId}...`);
          try {
            const dialogs = await this.client.getDialogs({ limit: 200 });
            const foundDialog = dialogs.find((d: any) => {
              const dId = d.entity?.id?.toString() || d.id?.toString();
              return dId === String(chatId);
            });
            if (foundDialog && foundDialog.entity) {
              entity = foundDialog.entity;
              this.logger.log(`✅ Method 2c - Found in dialogs: className=${(entity as any).className || 'unknown'}`);
              
              // Создаем InputPeer из найденного entity
              if ((entity as any).className === 'User') {
                entity = new Api.InputPeerUser({
                  userId: bigInt((entity as any).id),
                  accessHash: bigInt((entity as any).accessHash || '0'),
                });
                this.logger.log(`✅ Created InputPeerUser from dialog entity`);
              } else if ((entity as any).className === 'Chat') {
                entity = new Api.InputPeerChat({
                  chatId: bigInt((entity as any).id),
                });
                this.logger.log(`✅ Created InputPeerChat from dialog entity`);
              } else if ((entity as any).className === 'Channel') {
                entity = new Api.InputPeerChannel({
                  channelId: bigInt((entity as any).id),
                  accessHash: bigInt((entity as any).accessHash || '0'),
                });
                this.logger.log(`✅ Created InputPeerChannel from dialog entity`);
              }
            } else {
              this.logger.warn(`⚠️ Method 2c - Chat ${chatId} not found in dialogs`);
              throw new Error(`Cannot resolve chat entity: ${getEntityError.message}. Need valid telegramPeerId for this chat.`);
            }
          } catch (dialogsError: any) {
            this.logger.error(`❌ Method 2c - getDialogs failed: ${dialogsError.message || dialogsError}`);
            throw new Error(`Cannot resolve chat entity: ${getEntityError.message}. Need valid telegramPeerId for this chat.`);
          }
        }
      }
    
    if (!entity) {
      throw new Error('Failed to resolve entity for sending message');
    }

    return entity;
  }

  async sendMessage(chatId: string | number, text: string, telegramPeerId?: string | null): Promise<any> {
    if (!this.client || !this.isReady) {
      throw new Error('Telegram client not ready');
    }

    try {
      this.logger.log(`📤 Sending message to chat ${chatId}`);
      
      const entity = await this.resolveEntity(chatId, telegramPeerId);
      
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

  /**
   * Загрузить медиафайл в S3
   */
  private async uploadMediaToS3(
    buffer: Buffer,
    prefix: string,
    fileName: string,
    contentType: string
  ): Promise<string | null> {
    try {
      const key = `${prefix}${uuidv4()}_${fileName}`;
      
      await this.s3Service.putObject(key, buffer, contentType);
      return key;
    } catch (error: any) {
      this.logger.error(`❌ Failed to upload media to S3: ${error.message}`);
      return null;
    }
  }

  async sendMessageWithFile(
    chatId: string | number,
    text: string,
    objectKey: string,
    telegramPeerId?: string | null
  ): Promise<any> {
    if (!this.client || !this.isReady) {
      throw new Error('Telegram client not ready');
    }

    let tempFilePath: string | null = null;

    try {
      this.logger.log(`📤 Starting sendMessageWithFile: chatId=${chatId}, objectKey=${objectKey}, hasPeerId=${!!telegramPeerId}`);
      
      // Проверяем что objectKey валидный
      if (!objectKey || objectKey.trim() === '') {
        throw new Error('objectKey is empty or invalid');
      }
      
      this.logger.log(`🔍 Resolving entity for chatId=${chatId}...`);
      const entity = await this.resolveEntity(chatId, telegramPeerId);
      this.logger.log(`✅ Entity resolved successfully`);

      // Скачиваем файл из S3 во временную директорию
      this.logger.log(`📥 Downloading file from S3: ${objectKey}`);
      const fileData = await this.s3Service.getObject(objectKey);
      const buffer = fileData.body;
      
      if (!buffer || buffer.length === 0) {
        throw new Error(`Downloaded file is empty: ${objectKey}`);
      }
      
      this.logger.log(`✅ File downloaded from S3: ${buffer.length} bytes`);
      
      // Получаем MIME тип из метаданных S3 или из ответа getObject
      const contentType = fileData.contentType || 'application/octet-stream';
      this.logger.log(`📎 File type: ${contentType}`);

      // Создаем временный файл
      const tempDir = os.tmpdir();
      const fileName = path.basename(objectKey);
      tempFilePath = path.join(tempDir, `tg-${Date.now()}-${fileName}`);
      
      // Сохраняем файл
      fs.writeFileSync(tempFilePath, buffer);

      this.logger.log(`📥 File downloaded to: ${tempFilePath}`);

      // Определяем тип отправки по MIME типу
      let fileOptions: any = {
        file: tempFilePath,
      };

      // Добавляем текст как подпись, если есть
      if (text && text.trim()) {
        fileOptions.caption = text;
      }

      // Для фото используем специальный формат
      if (contentType.startsWith('image/')) {
        fileOptions.forceDocument = false; // Отправляем как фото
      } else {
        fileOptions.forceDocument = true; // Отправляем как документ
      }

      // Отправляем через Telethon
      const result = await this.client.sendFile(entity, fileOptions);

      this.logger.log(`✅ Message with file sent successfully: ${result.id}`);
      return result;
    } catch (error: any) {
      this.logger.error(`❌ Failed to send message with file to ${chatId}:`, error);
      this.logger.error(`Error details: ${error.message || JSON.stringify(error)}`);
      throw error;
    } finally {
      // Удаляем временный файл
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          this.logger.log(`🗑️ Temporary file deleted: ${tempFilePath}`);
        } catch (cleanupError) {
          this.logger.warn(`⚠️ Failed to delete temporary file: ${cleanupError}`);
        }
      }
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










