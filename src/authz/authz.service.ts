import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AuthzRepo, EffectivePermissions } from './authz.repo';

const EP_KEY_PREFIX = 'authz:ep:';
const EP_TTL = 600; // 10 min
const AUTHZ_CHANNEL = 'authz.user.updated';

@Injectable()
export class AuthzService {
  constructor(
    @Inject(REDIS_CLIENT) private redis: Redis,
    private repo: AuthzRepo
  ) {}

  /**
   * Получить EP из кэша; если нет/устарел (ver) — пересчитать и закэшировать
   */
  async getEffectivePermissions(userId: string): Promise<EffectivePermissions | null> {
    const key = EP_KEY_PREFIX + userId;
    const cached = await this.redis.get(key);

    if (cached) {
      const ep: EffectivePermissions = JSON.parse(cached);
      // Проверим актуальность версии
      const fresh = await this.repo.computeEP(userId);
      if (!fresh) return null;
      if (ep.ver === fresh.ver) {
        return ep;
      }
      // Версия устарела — обновляем кэш
      await this.redis.setex(key, EP_TTL, JSON.stringify(fresh));
      return fresh;
    }

    // Нет в кэше — вычисляем
    const ep = await this.repo.computeEP(userId);
    if (!ep) return null;

    await this.redis.setex(key, EP_TTL, JSON.stringify(ep));
    return ep;
  }

  /**
   * Инвалидация: perm_version++ → DEL кэш → PUBLISH authz.user.updated
   */
  async invalidateUser(userId: string): Promise<void> {
    await this.repo.incrementPermVersion(userId);
    const key = EP_KEY_PREFIX + userId;
    await this.redis.del(key);
    await this.redis.publish(AUTHZ_CHANNEL, JSON.stringify({ userId }));
  }

  /**
   * Проверка наличия permission
   */
  hasPermission(ep: EffectivePermissions, permission: string): boolean {
    return ep.permissions.includes(permission);
  }

  /**
   * Проверка доступа к каналу
   */
  hasChannelAccess(ep: EffectivePermissions, channelId: string): boolean {
    // Если allowedChannels пусто — доступ ко всем (manager)
    if (ep.allowedChannels.length === 0) return true;
    return ep.allowedChannels.includes(channelId);
  }
}





