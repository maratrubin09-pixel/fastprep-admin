import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  WASocket,
} from '@whiskeysockets/baileys';
import * as qrcode from 'qrcode';
import { Pool } from 'pg';
import { PG_POOL } from '../../db/db.module';
import * as fs from 'fs';
import * as path from 'path';
import * as dns from 'dns/promises';
import * as tls from 'tls';

interface WhatsAppSession {
  sock: WASocket;
  status: 'initializing' | 'qr_ready' | 'authenticated' | 'ready' | 'disconnected';
  qrCode?: string;
  accountInfo?: {
    phoneNumber: string;
    name: string;
    platform: string;
  };
  createdAt: Date;
  reconnectAttempts?: number;
}

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private sessions = new Map<string, WhatsAppSession>();
  private authDir = process.env.BAILEYS_DIR || '/var/data/baileys';

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    console.log('WhatsAppService initialized (baileys)');
    console.log(`Auth directory: ${this.authDir}`);
    
    // Create auth directory if it doesn't exist
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
      console.log(`✅ Created auth directory: ${this.authDir}`);
    }

    // DNS/TLS diagnostics
    await this.runNetworkDiagnostics();
  }

  private async runNetworkDiagnostics(): Promise<void> {
    const hosts = ['web.whatsapp.com', 'edge.whatsapp.com'];
    
    console.log('🔍 Running network diagnostics...');
    
    for (const host of hosts) {
      try {
        const addresses = await dns.lookup(host, { all: true });
        console.log(`✅ [DNS] ${host}:`, addresses.map(a => `${a.address} (${a.family})`).join(', '));
      } catch (err) {
        console.error(`❌ [DNS error] ${host}:`, (err as Error).message);
      }
    }

    // TLS check
    return new Promise<void>((resolve) => {
      const socket = tls.connect(
        {
          host: 'web.whatsapp.com',
          servername: 'web.whatsapp.com',
          port: 443,
          timeout: 5000,
        },
        () => {
          console.log('✅ [TLS] Connected to WhatsApp on port 443');
          socket.end();
          resolve();
        }
      );

      socket.on('error', (err) => {
        console.error('❌ [TLS error]:', err.message);
        resolve();
      });

      socket.on('timeout', () => {
        console.error('❌ [TLS timeout] Connection to WhatsApp timed out');
        socket.destroy();
        resolve();
      });
    });
  }

  async initConnection(userId: string, data?: Record<string, unknown>) {
    // Check if session already exists
    if (this.sessions.has(userId)) {
      const existingSession = this.sessions.get(userId);
      if (!existingSession) {
        throw new Error('Session not found');
      }
      if (existingSession.status === 'ready') {
        return {
          message: 'Already connected',
          status: 'ready',
          accountInfo: existingSession.accountInfo,
        };
      }
      // If already initializing or qr_ready, just return status
      if (existingSession.status === 'initializing' || existingSession.status === 'qr_ready') {
        return {
          message: 'Connection in progress',
          status: existingSession.status,
          sessionId: userId,
        };
      }
      // If not ready, destroy and recreate
      await this.disconnect(userId);
    }

    const sessionDir = path.join(this.authDir, `session_${userId}`);
    
    try {
      console.log(`Initializing WhatsApp for user ${userId}, session dir: ${sessionDir}`);
      
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const { version } = await fetchLatestBaileysVersion();
      
      console.log(`Baileys version: ${version.join('.')}`);

      // Create a proper logger that Baileys expects
      const logger = {
        level: 'error',
        fatal: (...args: any[]) => console.error('[Baileys FATAL]', ...args),
        error: (...args: any[]) => console.error('[Baileys ERROR]', ...args),
        warn: () => {},
        info: () => {},
        debug: () => {},
        trace: () => {},
        child: () => logger, // Return self for child loggers
      };

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger as any),
        },
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        browser: ['Chrome', '120.0.0', 'Windows'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 20000,
        keepAliveIntervalMs: 15000,
        logger: logger as any,
      });

      const session: WhatsAppSession = {
        sock,
        status: 'initializing',
        createdAt: new Date(),
        reconnectAttempts: 0,
      };

      this.sessions.set(userId, session);

      // Set up event handlers
      sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log(`QR code generated for user ${userId}`);
          try {
            const qrCodeDataUrl = await qrcode.toDataURL(qr);
            session.qrCode = qrCodeDataUrl;
            session.status = 'qr_ready';
          } catch (err) {
            console.error('Error generating QR code:', err);
          }
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          
          console.log(
            `❌ WhatsApp connection closed for user ${userId}`,
            `Status code: ${statusCode}`,
            `Reconnect: ${shouldReconnect}`,
            `Error:`, lastDisconnect?.error
          );

          if (shouldReconnect) {
            // Exponential backoff: 1s, 2s, 5s, 15s, 60s
            const attempts = session.reconnectAttempts || 0;
            const delays = [1000, 2000, 5000, 15000, 60000];
            const delay = delays[Math.min(attempts, delays.length - 1)];
            const jitter = Math.random() * 1000; // Add jitter
            
            console.log(`⏳ Will retry connection in ${(delay + jitter) / 1000}s (attempt ${attempts + 1})`);
            
            session.reconnectAttempts = attempts + 1;
            session.status = 'disconnected';
            
            // Don't auto-reconnect for now - let user manually reconnect
            // In production, you might want to enable this:
            // setTimeout(() => this.initConnection(userId, {}), delay + jitter);
          } else {
            session.status = 'disconnected';
            this.sessions.delete(userId);
            // Clean up session directory on logout
            const sessionDir = path.join(this.authDir, `session_${userId}`);
            if (fs.existsSync(sessionDir)) {
              fs.rmSync(sessionDir, { recursive: true, force: true });
            }
          }
        }

        if (connection === 'open') {
          console.log(`✅ WhatsApp connected for user ${userId}`);
          session.status = 'ready';
          session.reconnectAttempts = 0; // Reset reconnect counter

          // Get account info
          try {
            const me = sock.user;
            if (me) {
              session.accountInfo = {
                phoneNumber: me.id.split(':')[0],
                name: me.name || me.id,
                platform: 'WhatsApp',
              };

              // Save to database
              await this.pool.query(
                `INSERT INTO messenger_connections (user_id, platform, status, connection_data, connected_at)
                 VALUES ($1, 'whatsapp', 'connected', $2, NOW())
                 ON CONFLICT (user_id, platform)
                 DO UPDATE SET status = 'connected', connection_data = $2, connected_at = NOW()`,
                [userId, JSON.stringify(session.accountInfo)]
              );
            }
          } catch (err) {
            console.error('Error saving account info:', err);
          }
        }
      });

      // Credentials update
      sock.ev.on('creds.update', saveCreds);

      // Messages (for future inbox integration)
      sock.ev.on('messages.upsert', async (m: any) => {
        console.log(`New messages for user ${userId}:`, m.messages.length);
        // TODO: Save to database for unified inbox
      });

      // Return immediately with status
      return {
        sessionId: userId,
        status: 'initializing',
        message: 'Connection initiated. Poll /qr endpoint for QR code.',
      };
    } catch (err) {
      console.error('Error initializing WhatsApp:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(`Failed to initialize WhatsApp: ${errorMessage}`);
    }
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
    if (session && session.sock) {
      try {
        await session.sock.logout();
      } catch (err) {
        console.error('Error logging out from WhatsApp:', err);
      }
    }
    
    // Clean up session directory
    const sessionDir = path.join(this.authDir, `session_${userId}`);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    this.sessions.delete(userId);

    // Update database
    await this.pool.query(
      `UPDATE messenger_connections
       SET status = 'disconnected', connected_at = NULL
       WHERE user_id = $1 AND platform = 'whatsapp'`,
      [userId]
    );
  }

  async sendMessage(userId: string, to: string, message: string) {
    const session = this.sessions.get(userId);
    if (!session || session.status !== 'ready') {
      throw new Error('WhatsApp not connected');
    }

    try {
      const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
      const result = await session.sock.sendMessage(jid, { text: message });
      
      if (!result) {
        throw new Error('No result from sendMessage');
      }
      
      return {
        success: true,
        messageId: result.key?.id || 'unknown',
        timestamp: result.messageTimestamp || Date.now(),
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

    // Baileys doesn't have direct message history fetch like whatsapp-web.js
    // Messages are received via events and should be stored in database
    // For now, return empty array
    return [];
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
