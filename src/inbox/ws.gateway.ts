import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AuthzService } from '../authz/authz.service';
import { InboxService } from './inbox.service';

interface SocketData {
  userId: string;
  ep: { ver: number; permissions: string[]; allowedChannels: string[] };
}

@WebSocketGateway({ namespace: '/ws', cors: true })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private redisSub: Redis;

  constructor(
    @Inject(REDIS_CLIENT) private redis: Redis,
    private authz: AuthzService,
    private inbox: InboxService
  ) {
    // Отдельный Redis-клиент для подписки
    this.redisSub = this.redis.duplicate();
    this.redisSub.subscribe('authz.user.updated', (err) => {
      if (err) console.error('Redis subscribe error:', err);
    });

    this.redisSub.on('message', (channel, message) => {
      if (channel === 'authz.user.updated') {
        this.handleAuthzUpdate(message);
      }
    });
  }

  async handleConnection(client: Socket) {
    // Ожидаем handshake с { userId, token } — упрощённо
    const userId = client.handshake.auth?.userId;
    if (!userId) {
      client.disconnect();
      return;
    }

    const ep = await this.authz.getEffectivePermissions(userId);
    if (!ep) {
      client.disconnect();
      return;
    }

    const data: SocketData = { userId, ep };
    (client as any).data = data;

    // Отправляем hello
    client.emit('hello', { ver: ep.ver, perms: ep.permissions });
  }

  handleDisconnect(client: Socket) {
    // Cleanup if needed
  }

  /**
   * Обработка PUBLISH authz.user.updated → отправка ep.update клиенту
   */
  private async handleAuthzUpdate(message: string) {
    const { userId } = JSON.parse(message);
    const sockets = await this.server.fetchSockets();

    for (const socket of sockets) {
      const data = (socket as any).data as SocketData | undefined;
      if (data && data.userId === userId) {
        const ep = await this.authz.getEffectivePermissions(userId);
        if (ep) {
          data.ep = ep;
          socket.emit('ep.update', { ver: ep.ver, perms: ep.permissions });
        }
      }
    }
  }

  /**
   * Фильтрация событий inbox (упрощённо):
   * - менеджер (inbox.read_all) — всё
   * - агент — assignee ИЛИ allowedChannels ИЛИ unassigned+inbox.read_unassigned
   */
  async emitInboxEvent(threadId: string, event: string, payload: any) {
    const sockets = await this.server.fetchSockets();
    console.log(`📡 Emitting ${event} for thread ${threadId} to ${sockets.length} connected sockets`);

    let sentCount = 0;
    let skippedCount = 0;

    for (const socket of sockets) {
      const data = (socket as any).data as SocketData | undefined;
      if (!data) {
        skippedCount++;
        continue;
      }

      const canView = await this.canViewThread(data, threadId);
      if (canView) {
        socket.emit(event, payload);
        sentCount++;
        console.log(`✅ Sent ${event} to user ${data.userId}`);
      } else {
        skippedCount++;
        console.log(`⏭️ Skipped ${event} for user ${data.userId} (no permission)`);
      }
    }

    console.log(`📊 Event ${event} summary: sent=${sentCount}, skipped=${skippedCount}`);
  }

  private async canViewThread(data: SocketData, threadId: string): Promise<boolean> {
    // Менеджер — всё
    if (data.ep.permissions.includes('inbox.read_all') || data.ep.permissions.includes('inbox.view')) {
      return true;
    }

    // Агент — назначено ему
    const assignee = await this.inbox.getThreadAssignee(threadId);
    if (assignee === data.userId) {
      return true;
    }

    // Агент — allowedChannels (упрощённо: проверяем channel_id треда)
    // TODO: получить channel_id из conversations и проверить data.ep.allowedChannels

    // Агент — unassigned + право
    if (data.ep.permissions.includes('inbox.read_unassigned')) {
      const isUnassigned = await this.inbox.isThreadUnassigned(threadId);
      if (isUnassigned) {
        return true;
      }
    }

    return false;
  }
}










