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
Object.defineProperty(exports, "__esModule", { value: true });
exports.EpController = void 0;
const common_1 = require("@nestjs/common");
const authz_service_1 = require("./authz.service");
/**
 * Эндпоинт GET /api/auth/me/ep
 * Возвращает { ver, permissions, allowedChannels }
 * Предполагается, что JWT middleware уже установил req.user.id
 */
let EpController = class EpController {
    authz;
    constructor(authz) {
        this.authz = authz;
    }
    async getEP(req) {
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
};
exports.EpController = EpController;
__decorate([
    (0, common_1.Get)('ep'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], EpController.prototype, "getEP", null);
exports.EpController = EpController = __decorate([
    (0, common_1.Controller)('auth/me'),
    __metadata("design:paramtypes", [authz_service_1.AuthzService])
], EpController);
//# sourceMappingURL=ep.controller.js.map