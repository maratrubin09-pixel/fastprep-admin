import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { NylasModule } from '../nylas/nylas.module';
import { NylasController } from '../nylas/nylas.controller';
import { NylasService } from '../nylas/nylas.service';
import { EmailParseService } from '../nylas/email-parse.service';
import { DbModule } from '../db/db.module';
import { RedisModule } from '../redis/redis.module';
import { StorageModule } from '../storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import * as crypto from 'crypto';

describe('NylasController (smoke tests)', () => {
  let app: INestApplication;
  let nylasService: NylasService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        NylasModule,
        DbModule,
        RedisModule,
        StorageModule,
        AuthModule,
        AuthzModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    nylasService = moduleFixture.get<NylasService>(NylasService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/nylas/connect', () => {
    it('should return 302 redirect to OAuth URL', async () => {
      // Mock user in request (would normally come from JWT guard)
      const response = await request(app.getHttpServer())
        .get('/api/nylas/connect')
        .expect(302);

      expect(response.headers.location).toContain('api.nylas.com');
      expect(response.headers.location).toContain('connect/auth');
    });
  });

  describe('POST /api/nylas/webhook', () => {
    const webhookSecret = process.env.NYLAS_WEBHOOK_SECRET || 'test-secret';

    function createSignature(body: any): string {
      const bodyStr = JSON.stringify(body);
      return crypto
        .createHmac('sha256', webhookSecret)
        .update(bodyStr)
        .digest('hex');
    }

    it('should return 401 for request without signature', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/nylas/webhook')
        .send({ type: 'message.created', data: { id: 'test-123' } })
        .expect(401);

      expect(response.body.error).toBe('Missing signature');
    });

    it('should return 403 for request with invalid signature', async () => {
      const body = { type: 'message.created', data: { id: 'test-123' } };
      const invalidSignature = 'invalid-signature';

      const response = await request(app.getHttpServer())
        .post('/api/nylas/webhook')
        .set('x-nylas-signature', invalidSignature)
        .send(body)
        .expect(403);

      expect(response.body.error).toBe('Invalid signature');
    });

    it('should return 200 for duplicate webhook event (deduplication)', async () => {
      const eventId = `test-event-${Date.now()}`;
      const body = {
        type: 'message.created',
        data: { id: eventId, object: { id: 'msg-123' } },
      };
      const signature = createSignature(body);

      // First request
      await request(app.getHttpServer())
        .post('/api/nylas/webhook')
        .set('x-nylas-signature', signature)
        .send(body)
        .expect(200);

      // Duplicate request (should be deduplicated)
      const response = await request(app.getHttpServer())
        .post('/api/nylas/webhook')
        .set('x-nylas-signature', signature)
        .send(body)
        .expect(200);

      expect(response.body.message).toBe('Duplicate event');
    });

    it('should return 200 for unknown event type (safely ignored)', async () => {
      const eventId = `test-event-unknown-${Date.now()}`;
      const body = {
        type: 'calendar.event.created',
        data: { id: eventId },
      };
      const signature = createSignature(body);

      const response = await request(app.getHttpServer())
        .post('/api/nylas/webhook')
        .set('x-nylas-signature', signature)
        .send(body)
        .expect(200);

      expect(response.body.ok).toBe(true);
    });
  });
});

