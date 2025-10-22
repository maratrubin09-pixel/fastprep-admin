import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { HealthController } from '../routes/health.controller';
import { RedisModule } from '../redis/redis.module';
import { DbModule } from '../db/db.module';
import { AuthzModule } from '../authz/authz.module';
import { StorageModule } from '../storage/storage.module';
import { InboxModule } from '../inbox/inbox.module';
import { AuthMiddleware } from '../auth/auth.middleware';

@Module({
  imports: [RedisModule, DbModule, AuthzModule, StorageModule, InboxModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Применяем auth middleware ко всем маршрутам
    consumer
      .apply(AuthMiddleware)
      .forRoutes('*');
  }
}


