import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';

@Injectable()
export class PresenceService {
  constructor(@Inject(REDIS_CLIENT) private redis: Redis) {}

  /**
   * Mark user as online
   */
  async setOnline(userId: string): Promise<void> {
    await this.redis.sadd('presence:online', userId);
    await this.redis.set(`presence:lastSeen:${userId}`, new Date().toISOString());
  }

  /**
   * Mark user as offline
   */
  async setOffline(userId: string): Promise<void> {
    await this.redis.srem('presence:online', userId);
    await this.redis.set(`presence:lastSeen:${userId}`, new Date().toISOString());
  }

  /**
   * Check if user is online
   */
  async isOnline(userId: string): Promise<boolean> {
    const result = await this.redis.sismember('presence:online', userId);
    return result === 1;
  }

  /**
   * Get last seen timestamp
   */
  async getLastSeen(userId: string): Promise<Date | null> {
    const timestamp = await this.redis.get(`presence:lastSeen:${userId}`);
    if (!timestamp) return null;
    return new Date(timestamp);
  }

  /**
   * Get all online users
   */
  async getOnlineUsers(): Promise<string[]> {
    return this.redis.smembers('presence:online');
  }

  /**
   * Update last seen (heartbeat)
   */
  async updateLastSeen(userId: string): Promise<void> {
    await this.setOnline(userId); // Also mark as online
  }
}

