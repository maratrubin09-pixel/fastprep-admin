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
exports.AuthzService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const redis_module_1 = require("../redis/redis.module");
const authz_repo_1 = require("./authz.repo");
const EP_KEY_PREFIX = 'authz:ep:';
const EP_TTL = 600; // 10 min
const AUTHZ_CHANNEL = 'authz.user.updated';
let AuthzService = class AuthzService {
    redis;
    repo;
    constructor(redis, repo) {
        this.redis = redis;
        this.repo = repo;
    }
    /**
     * Получить EP из кэша; если нет/устарел (ver) — пересчитать и закэшировать
     */
    async getEffectivePermissions(userId) {
        const key = EP_KEY_PREFIX + userId;
        const cached = await this.redis.get(key);
        if (cached) {
            const ep = JSON.parse(cached);
            // Проверим актуальность версии
            const fresh = await this.repo.computeEP(userId);
            if (!fresh)
                return null;
            if (ep.ver === fresh.ver) {
                return ep;
            }
            // Версия устарела — обновляем кэш
            await this.redis.setex(key, EP_TTL, JSON.stringify(fresh));
            return fresh;
        }
        // Нет в кэше — вычисляем
        const ep = await this.repo.computeEP(userId);
        if (!ep)
            return null;
        await this.redis.setex(key, EP_TTL, JSON.stringify(ep));
        return ep;
    }
    /**
     * Инвалидация: perm_version++ → DEL кэш → PUBLISH authz.user.updated
     */
    async invalidateUser(userId) {
        await this.repo.incrementPermVersion(userId);
        const key = EP_KEY_PREFIX + userId;
        await this.redis.del(key);
        await this.redis.publish(AUTHZ_CHANNEL, JSON.stringify({ userId }));
    }
    /**
     * Проверка наличия permission
     */
    hasPermission(ep, permission) {
        return ep.permissions.includes(permission);
    }
    /**
     * Проверка доступа к каналу
     */
    hasChannelAccess(ep, channelId) {
        // Если allowedChannels пусто — доступ ко всем (manager)
        if (ep.allowedChannels.length === 0)
            return true;
        return ep.allowedChannels.includes(channelId);
    }
};
exports.AuthzService = AuthzService;
exports.AuthzService = AuthzService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [ioredis_1.default,
        authz_repo_1.AuthzRepo])
], AuthzService);
//# sourceMappingURL=authz.service.js.map