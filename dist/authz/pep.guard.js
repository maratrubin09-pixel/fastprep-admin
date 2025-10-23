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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PepGuard = exports.RequirePerm = exports.REQUIRE_PERM_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const authz_service_1 = require("./authz.service");
exports.REQUIRE_PERM_KEY = 'require_perm';
const RequirePerm = (permission) => (0, common_1.SetMetadata)(exports.REQUIRE_PERM_KEY, permission);
exports.RequirePerm = RequirePerm;
let PepGuard = class PepGuard {
    reflector;
    authz;
    constructor(reflector, authz) {
        this.reflector = reflector;
        this.authz = authz;
    }
    async canActivate(context) {
        const requiredPerm = this.reflector.get(exports.REQUIRE_PERM_KEY, context.getHandler());
        if (!requiredPerm) {
            // Если декоратор @RequirePerm не установлен, пропускаем
            return true;
        }
        const req = context.switchToHttp().getRequest();
        const userId = req.user?.id; // Предполагается, что JWT middleware уже прошёл и установил req.user
        if (!userId) {
            throw new common_1.ForbiddenException('User not authenticated');
        }
        const ep = await this.authz.getEffectivePermissions(userId);
        if (!ep) {
            throw new common_1.ForbiddenException('User permissions not found');
        }
        if (!this.authz.hasPermission(ep, requiredPerm)) {
            throw new common_1.ForbiddenException(`Missing permission: ${requiredPerm}`);
        }
        // Прикрепляем EP к req для дальнейшего использования
        req.ep = ep;
        return true;
    }
};
exports.PepGuard = PepGuard;
exports.PepGuard = PepGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        authz_service_1.AuthzService])
], PepGuard);
//# sourceMappingURL=pep.guard.js.map