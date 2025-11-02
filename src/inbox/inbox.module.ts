import { Module, forwardRef } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AuthzModule } from '../authz/authz.module';
import { DbModule } from '../db/db.module';
import { RedisModule } from '../redis/redis.module';
import { UploadsController } from './uploads.controller';
import { MessagesController } from './messages.controller';
import { TelegramEventsController } from './telegram-events.controller';
import { WsGateway } from './ws.gateway';
import { InboxService } from './inbox.service';
import { TelegramModule } from '../messengers/telegram/telegram.module';

@Module({
  imports: [StorageModule, AuthzModule, DbModule, RedisModule, forwardRef(() => TelegramModule)],
  providers: [InboxService, WsGateway],
  controllers: [UploadsController, MessagesController, TelegramEventsController],
  exports: [InboxService],
})
export class InboxModule {}








