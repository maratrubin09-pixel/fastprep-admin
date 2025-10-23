"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const redis_module_1 = require("../redis/redis.module");
const authz_service_1 = require("../authz/authz.service");
const inbox_service_1 = require("./inbox.service");
let WsGateway = class WsGateway {
    redis;
    authz;
    inbox;
    server;
    redisSub;
    constructor(redis, authz, inbox) {
        this.redis = redis;
        this.authz = authz;
        this.inbox = inbox;
        // Отдельный Redis-клиент для подписки
        this.redisSub = this.redis.duplicate();
        this.redisSub.subscribe('authz.user.updated', (err) => {
            if (err)
                console.error('Redis subscribe error:', err);
        });
        this.redisSub.on('message', (channel, message) => {
            if (channel === 'authz.user.updated') {
                this.handleAuthzUpdate(message);
            }
        });
    }
    async handleConnection(client) {
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
        const data = { userId, ep };
        client.data = data;
        // Отправляем hello
        client.emit('hello', { ver: ep.ver, perms: ep.permissions });
    }
    handleDisconnect(client) {
        // Cleanup if needed
    }
    /**
     * Обработка PUBLISH authz.user.updated → отправка ep.update клиенту
     */
    async handleAuthzUpdate(message) {
        const { userId } = JSON.parse(message);
        const sockets = await this.server.fetchSockets();
        for (const socket of sockets) {
            const data = socket.data;
            if (data?.userId === userId) {
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
    async emitInboxEvent(threadId, event, payload) {
        const sockets = await this.server.fetchSockets();
        for (const socket of sockets) {
            const data = socket.data;
            if (!data)
                continue;
            const canView = await this.canViewThread(data, threadId);
            if (canView) {
                socket.emit(event, payload);
            }
        }
    }
    async canViewThread(data, threadId) {
        // Менеджер — всё
        if (data.ep.permissions.includes('inbox.read_all')) {
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
};
exports.WsGateway = WsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], WsGateway.prototype, "server", void 0);
exports.WsGateway = WsGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/ws', cors: true }),
    __param(0, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [ioredis_1.default,
        authz_service_1.AuthzService,
        inbox_service_1.InboxService])
], WsGateway);
//# sourceMappingURL=ws.gateway.js.map