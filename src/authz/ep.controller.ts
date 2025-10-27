import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthzService } from './authz.service';

/**
 * Эндпоинт GET /api/auth/me/ep
 * Возвращает { ver, permissions, allowedChannels }
 * Предполагается, что JWT middleware уже установил req.user.id
 */
@Controller('auth/me')
export class EpController {
  constructor(private authz: AuthzService) {}

  @Get('ep')
  async getEP(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      return { error: 'Not authenticated' };
    }

    const ep = await this.authz.getEffectivePermissions(userId);
    if (!ep) {
      return { error: 'User not found' };
    }

    return {
      ver: ep.ver,
      permissions: ep.permissions,
      allowedChannels: ep.allowedChannels,
    };
  }
}





