import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthzService } from './authz.service';

export const REQUIRE_PERM_KEY = 'require_perm';
export const RequirePerm = (permission: string) => SetMetadata(REQUIRE_PERM_KEY, permission);

@Injectable()
export class PepGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authz: AuthzService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPerm = this.reflector.get<string>(REQUIRE_PERM_KEY, context.getHandler());
    if (!requiredPerm) {
      // Если декоратор @RequirePerm не установлен, пропускаем
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id; // Предполагается, что JWT middleware уже прошёл и установил req.user

    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    const ep = await this.authz.getEffectivePermissions(userId);
    if (!ep) {
      throw new ForbiddenException('User permissions not found');
    }

    if (!this.authz.hasPermission(ep, requiredPerm)) {
      throw new ForbiddenException(`Missing permission: ${requiredPerm}`);
    }

    // Прикрепляем EP к req для дальнейшего использования
    req.ep = ep;
    return true;
  }
}






