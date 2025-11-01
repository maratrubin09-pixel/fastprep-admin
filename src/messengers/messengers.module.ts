import { Module } from '@nestjs/common';
import { MessengersController } from './messengers.controller';
import { MessengersService } from './messengers.service';
import { TelegramModule } from './telegram/telegram.module';
import { InstagramService } from './instagram/instagram.service';
import { FacebookService } from './facebook/facebook.service';
import { DbModule } from '../db/db.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [DbModule, RedisModule, TelegramModule],
  controllers: [MessengersController],
  providers: [
    MessengersService,
    InstagramService,
    FacebookService,
  ],
  exports: [MessengersService],
})
export class MessengersModule {}













