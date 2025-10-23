import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import * as qrcode from 'qrcode';
import { Pool } from 'pg';
import { PG_POOL } from '../../db/db.module';
import * as fs from 'fs';
import * as path from 'path';

interface WhatsAppSession {
  sock: any;
  status: 'initializing' | 'qr_ready' | 'authenticated' | 'ready' | 'disconnected';
  qrCode?: string;
  accountInfo?: any;
  createdAt: Date;
}

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private sessions = new Map<string, WhatsAppSession>();
  private authDir = path.join(process.cwd(), 'auth_sessions');

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    console.log('WhatsAppService initialized (baileys)');
    
    // Create auth directory if it doesn't exist
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
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

    const sessionDir = path.join(this.authDir, `session_${userId}`);
    
    try {
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, console as any),
        },
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
      });

      const session: WhatsAppSession = {
        sock,
        status: 'initializing',
        createdAt: new Date(),
      };

      this.sessions.set(userId, session);

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('QR code generation timeout'));
        }, 60000); // 60 second timeout

        let qrResolved = false; // Flag to ensure we only resolve once

        // QR Code event
        sock.ev.on('connection.update', async (update) => {
          const { connection, lastDisconnect, qr } = update;

          if (qr && !qrResolved) {
            console.log(`QR code generated for user ${userId}`);
            try {
              const qrCodeDataUrl = await qrcode.toDataURL(qr);
              session.qrCode = qrCodeDataUrl;
              session.status = 'qr_ready';

              qrResolved = true; // Mark as resolved
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
          } else if (qr && qrResolved) {
            // Update session with new QR but don't resolve again
            console.log(`QR code updated for user ${userId}`);
            try {
              const qrCodeDataUrl = await qrcode.toDataURL(qr);
              session.qrCode = qrCodeDataUrl;
            } catch (err) {
              console.error('Error updating QR code:', err);
            }
          }

          if (connection === 'close') {
            const shouldReconnect =
              (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
            
            console.log(
              `WhatsApp connection closed for user ${userId}, reconnect: ${shouldReconnect}`
            );

            if (shouldReconnect) {
              // Don't auto-reconnect, let user manually reconnect
              session.status = 'disconnected';
            } else {
              session.status = 'disconnected';
              this.sessions.delete(userId);
            }
          }

          if (connection === 'open') {
            console.log(`WhatsApp connected for user ${userId}`);
            session.status = 'ready';

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
        sock.ev.on('messages.upsert', async (m) => {
          console.log(`New messages for user ${userId}:`, m.messages.length);
          // TODO: Save to database for unified inbox
        });
      });
    } catch (err) {
      console.error('Error initializing WhatsApp:', err);
      throw new Error(`Failed to initialize WhatsApp: ${err.message}`);
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
      
      return {
        success: true,
        messageId: result.key.id,
        timestamp: result.messageTimestamp,
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
