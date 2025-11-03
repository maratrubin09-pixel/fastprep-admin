import { Module, forwardRef } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AuthzModule } from '../authz/authz.module';
import { DbModule } from '../db/db.module';
import { RedisModule } from '../redis/redis.module';
import { UploadsController } from './uploads.controller';
import { MessagesController } from './messages.controller';
import { TelegramEventsController } from './telegram-events.controller';
import { NotesController } from './controllers/notes.controller';
import { WsGateway } from './ws.gateway';
import { InboxService } from './inbox.service';
import { NotesService } from './services/notes.service';
import { PresenceService } from './services/presence.service';
import { ConversationSettingsService } from './services/conversation-settings.service';
import { TelegramModule } from '../messengers/telegram/telegram.module';

@Module({
  imports: [StorageModule, AuthzModule, DbModule, RedisModule, forwardRef(() => TelegramModule)],
  providers: [InboxService, NotesService, PresenceService, ConversationSettingsService, WsGateway],
  controllers: [UploadsController, MessagesController, TelegramEventsController, NotesController],
  exports: [InboxService, NotesService, PresenceService, ConversationSettingsService],
})
export class InboxModule {}








