import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';
import { WhatsAppService } from './whatsapp/whatsapp.service';
import { TelegramService } from './telegram/telegram.service';
import { InstagramService } from './instagram/instagram.service';
import { FacebookService } from './facebook/facebook.service';

@Injectable()
export class MessengersService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly whatsappService: WhatsAppService,
    private readonly telegramService: TelegramService,
    private readonly instagramService: InstagramService,
    private readonly facebookService: FacebookService
  ) {}

  private getUserIdFromToken(token: string): string {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      return decoded.userId;
    } catch (err) {
      throw new Error('Invalid token');
    }
  }

  private getServiceForPlatform(platform: string) {
    switch (platform.toLowerCase()) {
      case 'whatsapp':
        return this.whatsappService;
      case 'telegram':
        return this.telegramService;
      case 'instagram':
        return this.instagramService;
      case 'facebook':
        return this.facebookService;
      default:
        throw new Error('Unsupported platform');
    }
  }

  async getStatus(token: string) {
    const userId = this.getUserIdFromToken(token);

    // Get all messenger connections for this user
    const result = await this.pool.query(
      `SELECT platform, status, connection_data, connected_at
       FROM messenger_connections
       WHERE user_id = $1`,
      [userId]
    );

    const platforms = ['whatsapp', 'telegram', 'instagram', 'facebook'];
    const status = platforms.map(platform => {
      const connection = result.rows.find(r => r.platform === platform);
      return {
        platform,
        isConnected: connection?.status === 'connected',
        connectionDetails: connection?.connection_data?.accountName || null,
        connectedAt: connection?.connected_at || null,
      };
    });

    return status;
  }

  async connect(token: string, platform: string, data: any) {
    const userId = this.getUserIdFromToken(token);
    const service = this.getServiceForPlatform(platform);

    // Start connection process (returns QR code or connection instructions)
    const connectionResult = await service.initConnection(userId, data);

    // Save pending connection in database
    await this.pool.query(
      `INSERT INTO messenger_connections (id, user_id, platform, status, connection_data, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'pending', $3, NOW())
       ON CONFLICT (user_id, platform)
       DO UPDATE SET status = 'pending', connection_data = $3, created_at = NOW()`,
      [userId, platform, JSON.stringify(connectionResult)]
    );

    return connectionResult;
  }

  async getQrCode(token: string, platform: string) {
    const userId = this.getUserIdFromToken(token);
    const service = this.getServiceForPlatform(platform);

    // Get QR code for connection
    const qrCode = await service.getQrCode(userId);
    return qrCode;
  }

  async verify(token: string, platform: string) {
    const userId = this.getUserIdFromToken(token);
    const service = this.getServiceForPlatform(platform);

    // Verify if connection was successful
    const isConnected = await service.verifyConnection(userId);

    if (isConnected) {
      // Update database
      const accountInfo = await service.getAccountInfo(userId);
      await this.pool.query(
        `UPDATE messenger_connections
         SET status = 'connected', connection_data = $1, connected_at = NOW()
         WHERE user_id = $2 AND platform = $3`,
        [JSON.stringify(accountInfo), userId, platform]
      );

      return { connected: true, accountInfo };
    }

    return { connected: false };
  }

  async disconnect(token: string, platform: string) {
    const userId = this.getUserIdFromToken(token);
    const service = this.getServiceForPlatform(platform);

    // Disconnect from platform
    await service.disconnect(userId);

    // Update database
    await this.pool.query(
      `UPDATE messenger_connections
       SET status = 'disconnected', connected_at = NULL
       WHERE user_id = $1 AND platform = $2`,
      [userId, platform]
    );
  }
}

