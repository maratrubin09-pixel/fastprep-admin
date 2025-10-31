import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { StorageModule } from '../../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}

