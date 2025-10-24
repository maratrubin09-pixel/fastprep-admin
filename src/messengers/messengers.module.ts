import { Module } from '@nestjs/common';
import { MessengersController } from './messengers.controller';
import { MessengersService } from './messengers.service';
import { WhatsAppService } from './whatsapp/whatsapp.service';
import { TelegramService } from './telegram/telegram.service';
import { InstagramService } from './instagram/instagram.service';
import { FacebookService } from './facebook/facebook.service';
import { DbModule } from '../db/db.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [DbModule, RedisModule],
  controllers: [MessengersController],
  providers: [
    MessengersService,
    WhatsAppService,
    TelegramService,
    InstagramService,
    FacebookService,
  ],
  exports: [MessengersService],
})
export class MessengersModule {}


