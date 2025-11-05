import { Module } from '@nestjs/common';
import { HealthController } from '../routes/health.controller';
import { InitDbController } from '../routes/init-db.controller';
import { UpdateAdminEmailController } from '../routes/update-admin-email.controller';
import { DebugController } from '../routes/debug.controller';
import { RedisModule } from '../redis/redis.module';
import { DbModule } from '../db/db.module';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { StorageModule } from '../storage/storage.module';
import { InboxModule } from '../inbox/inbox.module';
import { MessengersModule } from '../messengers/messengers.module';
import { NylasModule } from '../nylas/nylas.module';

@Module({
  imports: [RedisModule, DbModule, AuthModule, AuthzModule, StorageModule, InboxModule, MessengersModule, NylasModule],
  controllers: [HealthController, InitDbController, UpdateAdminEmailController, DebugController],
})
export class AppModule {}








