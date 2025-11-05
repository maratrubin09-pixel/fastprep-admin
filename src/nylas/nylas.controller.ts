import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  Body,
  Logger,
  Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { NylasService } from './nylas.service';
import { EmailParseService } from './email-parse.service';
import { Public } from '../auth/public.decorator';
import { PG_POOL } from '../db/db.module';
import { REDIS_CLIENT } from '../redis/redis.module';
import * as crypto from 'crypto';

@Controller('nylas')
export class NylasController {
  private readonly logger = new Logger(NylasController.name);

  constructor(
    @Inject(PG_POOL) private pool: Pool,
    @Inject(REDIS_CLIENT) private redis: Redis,
    private nylasService: NylasService,
    private parseService: EmailParseService
  ) {}

  /**
   * GET /api/nylas/connect
   * Initiate OAuth flow
   */
  @Get('connect')
  async connect(@Req() req: Request, @Res() res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const redirectUri =
        process.env.NYLAS_REDIRECT_URI ||
        `${process.env.APP_ORIGIN || 'https://admin.fastprepusa.com'}/api/nylas/oauth/callback`;

      const authUrl = this.nylasService.getOAuthUrl(redirectUri);
      this.logger.log(`🔗 OAuth URL generated for user ${userId}`);

      return res.redirect(authUrl);
    } catch (error: any) {
      this.logger.error('❌ Failed to generate OAuth URL:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/nylas/oauth/callback
   * Handle OAuth callback
   */
  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    try {
      if (error) {
        this.logger.error(`❌ OAuth error: ${error}`);
        return res.redirect(
          `${process.env.APP_ORIGIN || 'https://admin.fastprepusa.com'}/settings?error=oauth_failed`
        );
      }

      if (!code) {
        return res.redirect(
          `${process.env.APP_ORIGIN || 'https://admin.fastprepusa.com'}/settings?error=no_code`
        );
      }

      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const redirectUri =
        process.env.NYLAS_REDIRECT_URI ||
        `${process.env.APP_ORIGIN || 'https://admin.fastprepusa.com'}/api/nylas/oauth/callback`;

      const tokens = await this.nylasService.exchangeCodeForToken(
        code,
        redirectUri
      );

      await this.nylasService.saveEmailAccount(
        userId,
        tokens.email,
        tokens.accessToken,
        tokens.refreshToken,
        tokens.expiresIn,
        tokens.grantId
      );

      this.logger.log(`✅ Email account connected: ${tokens.email} for user ${userId}`);

      return res.redirect(
        `${process.env.APP_ORIGIN || 'https://admin.fastprepusa.com'}/settings?email_connected=true`
      );
    } catch (error: any) {
      this.logger.error('❌ OAuth callback failed:', error);
      return res.redirect(
        `${process.env.APP_ORIGIN || 'https://admin.fastprepusa.com'}/settings?error=callback_failed`
      );
    }
  }

  /**
   * GET /api/nylas/webhook?challenge=xxx
   * Verify webhook endpoint (Nylas challenge)
   */
  @Public()
  @Get('webhook')
  async webhookChallenge(@Query('challenge') challenge: string, @Res() res: Response) {
    this.logger.log(`🔍 Webhook challenge request received: challenge=${challenge || 'missing'}`);
    
    if (!challenge) {
      this.logger.warn('⚠️ Challenge parameter missing');
      return res.status(400).json({ error: 'Missing challenge parameter' });
    }
    
    this.logger.log(`✅ Webhook challenge received: ${challenge}`);
    // Return challenge as plain text (Nylas requirement)
    // Important: Set Content-Type header
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(challenge);
  }

  /**
   * POST /api/nylas/webhook
   * Handle Nylas webhook events
   * Public endpoint (validated by HMAC signature)
   */
  @Public()
  @Post('webhook')
  async webhook(@Req() req: Request, @Res() res: Response) {
    try {
      // 1. Verify HMAC signature
      const signature = req.headers['x-nylas-signature'] as string;
      const webhookSecret = process.env.NYLAS_WEBHOOK_SECRET;

      if (!webhookSecret) {
        this.logger.error('❌ NYLAS_WEBHOOK_SECRET not configured');
        return res.status(500).json({ error: 'Webhook secret not configured' });
      }

      if (!signature) {
        this.logger.warn('⚠️ Webhook request without signature');
        return res.status(401).json({ error: 'Missing signature' });
      }

      const body = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');

      if (signature !== expectedSignature) {
        this.logger.warn('⚠️ Invalid webhook signature');
        return res.status(403).json({ error: 'Invalid signature' });
      }

      // 2. Idempotency check (Redis)
      const eventId = req.body.data?.id || req.body.id;
      if (!eventId) {
        this.logger.warn('⚠️ Webhook event without ID');
        return res.status(200).json({ ok: true, message: 'Event ignored (no ID)' });
      }

      const dedupKey = `nylas:webhook:${eventId}`;
      const existing = await this.redis.get(dedupKey);
      if (existing) {
        this.logger.log(`✅ Duplicate webhook event ${eventId} (deduplicated)`);
        this.nylasService['webhookDedupHitsTotal'].inc();
        return res.status(200).json({ ok: true, message: 'Duplicate event' });
      }

      // Set dedup key with TTL 300s
      await this.redis.setex(dedupKey, 300, '1');

      // 3. Process event in background
      const eventType = req.body.type || req.body.data?.type;
      const eventData = req.body.data || req.body;

      // Increment webhook events metric
      this.nylasService['webhookEventsTotal'].inc({ type: eventType || 'unknown' });

      if (eventType === 'message.created') {
        // Process in background (fire and forget)
        this.processMessageCreated(eventData).catch((error) => {
          this.logger.error(`❌ Failed to process message.created:`, error);
          this.nylasService['emailParseFailTotal'].inc();
        });
      } else {
        this.logger.log(`ℹ️ Ignoring webhook event type: ${eventType}`);
      }

      // 4. Respond immediately
      return res.status(200).json({ ok: true });
    } catch (error: any) {
      this.logger.error('❌ Webhook processing error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * Process message.created event
   */
  private async processMessageCreated(eventData: any): Promise<void> {
    try {
      const message = eventData.object;
      if (!message || !message.id) {
        this.logger.warn('⚠️ Invalid message.created event data');
        return;
      }

      // Get email account by grant_id
      const grantId = eventData.grant_id;
      if (!grantId) {
        this.logger.warn('⚠️ message.created event without grant_id');
        return;
      }

      const accountResult = await this.pool.query(
        `SELECT id FROM email_accounts WHERE nylas_grant_id = $1 LIMIT 1`,
        [grantId]
      );

      if (accountResult.rows.length === 0) {
        this.logger.warn(`⚠️ No email account found for grant_id ${grantId}`);
        return;
      }

      const emailAccountId = accountResult.rows[0].id;
      const accessToken = await this.nylasService.getValidAccessToken(
        emailAccountId
      );

      await this.parseService.parseAndSaveMessage(
        emailAccountId,
        message,
        accessToken
      );

      this.logger.log(`✅ Processed message.created event: ${message.id}`);
    } catch (error: any) {
      this.logger.error('❌ Failed to process message.created:', error);
      await this.nylasService['emailParseFailTotal'].inc();
      throw error;
    }
  }
}

