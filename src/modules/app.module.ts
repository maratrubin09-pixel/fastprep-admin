import { Module } from '@nestjs/common';
import { HealthController } from '../routes/health.controller';
import { InitDbController } from '../routes/init-db.controller';
import { RedisModule } from '../redis/redis.module';
import { DbModule } from '../db/db.module';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { StorageModule } from '../storage/storage.module';
import { InboxModule } from '../inbox/inbox.module';

@Module({
  imports: [RedisModule, DbModule, AuthModule, AuthzModule, StorageModule, InboxModule],
  controllers: [HealthController, InitDbController],
})
export class AppModule {}


