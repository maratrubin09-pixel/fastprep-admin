import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Counter, Registry } from 'prom-client';
import { TokenEncryption } from './token-encryption';
import { EmailParseService } from './email-parse.service';
import { S3Service } from '../storage/s3.service';

@Injectable()
export class NylasService {
  private readonly logger = new Logger(NylasService.name);
  private redis: Redis;
  
  // Prometheus metrics
  private readonly webhookEventsTotal: Counter;
  private readonly webhookDedupHitsTotal: Counter;
  private readonly refreshTokenTotal: Counter;
  private readonly emailParseFailTotal: Counter;

  constructor(
    @Inject(PG_POOL) private pool: Pool,
    @Inject(REDIS_CLIENT) private redisClient: Redis,
    private parseService: EmailParseService,
    private s3Service: S3Service
  ) {
    const clientId = process.env.NYLAS_CLIENT_ID;
    const clientSecret = process.env.NYLAS_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      this.logger.warn('⚠️ NYLAS_CLIENT_ID or NYLAS_CLIENT_SECRET not set');
    }

    this.redis = redisClient;

    // Initialize metrics
    const register = new Registry();
    this.webhookEventsTotal = new Counter({
      name: 'nylas_webhook_events_total',
      help: 'Total Nylas webhook events received',
      labelNames: ['type'],
      registers: [register],
    });

    this.webhookDedupHitsTotal = new Counter({
      name: 'nylas_webhook_dedup_hits_total',
      help: 'Total duplicate webhook events detected',
      registers: [register],
    });

    this.refreshTokenTotal = new Counter({
      name: 'nylas_refresh_token_total',
      help: 'Total token refresh operations',
      labelNames: ['status'],
      registers: [register],
    });

    this.emailParseFailTotal = new Counter({
      name: 'email_parse_fail_total',
      help: 'Total email parsing failures',
      registers: [register],
    });
  }

  /**
   * Get OAuth URL for connection
   */
  getOAuthUrl(redirectUri: string): string {
    const clientId = process.env.NYLAS_CLIENT_ID;
    if (!clientId) {
      throw new Error('NYLAS_CLIENT_ID not configured');
    }

    const scopes = ['email.read_only', 'email.send'];
    const authUrl = `https://api.nylas.com/v3/connect/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scopes=${scopes.join(' ')}&access_type=offline&prompt=consent`;

    return authUrl;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    email: string;
    grantId: string;
  }> {
    const clientId = process.env.NYLAS_CLIENT_ID;
    const clientSecret = process.env.NYLAS_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Nylas credentials not configured');
    }

    // Exchange code for token
    const response = await fetch('https://api.nylas.com/v3/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      email: data.email,
      grantId: data.grant_id,
    };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const clientId = process.env.NYLAS_CLIENT_ID;
    const clientSecret = process.env.NYLAS_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Nylas credentials not configured');
    }

    const response = await fetch('https://api.nylas.com/v3/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Get valid access token for email account (refresh if needed)
   */
  async getValidAccessToken(emailAccountId: string): Promise<string> {
    const result = await this.pool.query(
      `SELECT access_token_encrypted, refresh_token_encrypted, expires_at FROM email_accounts WHERE id = $1`,
      [emailAccountId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Email account ${emailAccountId} not found`);
    }

    const account = result.rows[0];
    const now = new Date();
    const expiresAt = new Date(account.expires_at);

    // If token expires in less than 5 minutes, refresh it
    if (now.getTime() >= expiresAt.getTime() - 5 * 60 * 1000) {
      this.logger.log(`🔄 Refreshing token for email account ${emailAccountId}`);
      try {
        const refreshToken = TokenEncryption.decrypt(account.refresh_token_encrypted);
        const { accessToken, expiresIn } = await this.refreshAccessToken(refreshToken);

        // Update account with new token
        const newExpiresAt = new Date(now.getTime() + expiresIn * 1000);
        await this.pool.query(
          `UPDATE email_accounts SET access_token_encrypted = $1, expires_at = $2, updated_at = NOW() WHERE id = $3`,
          [TokenEncryption.encrypt(accessToken), newExpiresAt, emailAccountId]
        );

        this.refreshTokenTotal.inc({ status: 'success' });
        return accessToken;
      } catch (error: any) {
        this.refreshTokenTotal.inc({ status: 'failed' });
        throw error;
      }
    }

    return TokenEncryption.decrypt(account.access_token_encrypted);
  }

  /**
   * Save email account after OAuth
   */
  async saveEmailAccount(
    userId: string,
    email: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    grantId: string
  ): Promise<string> {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const result = await this.pool.query(
      `INSERT INTO email_accounts (user_id, email, provider, nylas_grant_id, access_token_encrypted, refresh_token_encrypted, expires_at)
       VALUES ($1, $2, 'nylas', $3, $4, $5, $6)
       ON CONFLICT (email, user_id) 
       DO UPDATE SET 
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
         expires_at = EXCLUDED.expires_at,
         nylas_grant_id = EXCLUDED.nylas_grant_id,
         updated_at = NOW()
       RETURNING id`,
      [
        userId,
        email,
        grantId,
        TokenEncryption.encrypt(accessToken),
        TokenEncryption.encrypt(refreshToken),
        expiresAt,
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Send email via Nylas
   */
  async sendEmail(
    emailAccountId: string,
    to: string[],
    subject: string,
    bodyHtml?: string,
    bodyText?: string,
    cc?: string[],
    bcc?: string[]
  ): Promise<string> {
    const accessToken = await this.getValidAccessToken(emailAccountId);

    const payload: any = {
      to: to.map((email) => ({ email })),
      subject,
    };

    if (bodyHtml) payload.body_html = bodyHtml;
    if (bodyText) payload.body_text = bodyText;
    if (cc) payload.cc = cc.map((email) => ({ email }));
    if (bcc) payload.bcc = bcc.map((email) => ({ email }));

    const response = await fetch('https://api.nylas.com/v3/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send email: ${error}`);
    }

    const data = await response.json();
    return data.id;
  }

  /**
   * Get metrics (for Prometheus export)
   */
  getMetrics() {
    return {
      webhookEventsTotal: this.webhookEventsTotal,
      webhookDedupHitsTotal: this.webhookDedupHitsTotal,
      refreshTokenTotal: this.refreshTokenTotal,
      emailParseFailTotal: this.emailParseFailTotal,
    };
  }
}
