import { Module } from '@nestjs/common';
import { AuthzRepo } from './authz.repo';
import { AuthzService } from './authz.service';
import { PepGuard } from './pep.guard';
import { EpController } from './ep.controller';

@Module({
  providers: [AuthzRepo, AuthzService, PepGuard],
  controllers: [EpController],
  exports: [AuthzService, PepGuard],
})
export class AuthzModule {}

