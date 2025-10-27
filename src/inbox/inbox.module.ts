import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AuthzModule } from '../authz/authz.module';
import { UploadsController } from './uploads.controller';
import { MessagesController } from './messages.controller';
import { TelegramEventsController } from './telegram-events.controller';
import { WsGateway } from './ws.gateway';
import { InboxService } from './inbox.service';

@Module({
  imports: [StorageModule, AuthzModule],
  providers: [InboxService, WsGateway],
  controllers: [UploadsController, MessagesController, TelegramEventsController],
  exports: [InboxService],
})
export class InboxModule {}




