import { Module } from '@nestjs/common';
import { HealthController } from '../routes/health.controller';
import { RedisModule } from '../redis/redis.module';
import { DbModule } from '../db/db.module';
import { AuthzModule } from '../authz/authz.module';
import { StorageModule } from '../storage/storage.module';
import { InboxModule } from '../inbox/inbox.module';

@Module({
  imports: [RedisModule, DbModule, AuthzModule, StorageModule, InboxModule],
  controllers: [HealthController],
})
export class AppModule {}


