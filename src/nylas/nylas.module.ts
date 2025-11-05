import { Module } from '@nestjs/common';
import { NylasController } from './nylas.controller';
import { NylasService } from './nylas.service';
import { EmailParseService } from './email-parse.service';
import { DbModule } from '../db/db.module';
import { RedisModule } from '../redis/redis.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [DbModule, RedisModule, StorageModule],
  controllers: [NylasController],
  providers: [NylasService, EmailParseService],
  exports: [NylasService],
})
export class NylasModule {}

