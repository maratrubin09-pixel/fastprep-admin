"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const health_controller_1 = require("../routes/health.controller");
const init_db_controller_1 = require("../routes/init-db.controller");
const update_admin_email_controller_1 = require("../routes/update-admin-email.controller");
const redis_module_1 = require("../redis/redis.module");
const db_module_1 = require("../db/db.module");
const auth_module_1 = require("../auth/auth.module");
const authz_module_1 = require("../authz/authz.module");
const storage_module_1 = require("../storage/storage.module");
const inbox_module_1 = require("../inbox/inbox.module");
const messengers_module_1 = require("../messengers/messengers.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [redis_module_1.RedisModule, db_module_1.DbModule, auth_module_1.AuthModule, authz_module_1.AuthzModule, storage_module_1.StorageModule, inbox_module_1.InboxModule, messengers_module_1.MessengersModule],
        controllers: [health_controller_1.HealthController, init_db_controller_1.InitDbController, update_admin_email_controller_1.UpdateAdminEmailController],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map