"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthzModule = void 0;
const common_1 = require("@nestjs/common");
const authz_repo_1 = require("./authz.repo");
const authz_service_1 = require("./authz.service");
const pep_guard_1 = require("./pep.guard");
const ep_controller_1 = require("./ep.controller");
let AuthzModule = class AuthzModule {
};
exports.AuthzModule = AuthzModule;
exports.AuthzModule = AuthzModule = __decorate([
    (0, common_1.Module)({
        providers: [authz_repo_1.AuthzRepo, authz_service_1.AuthzService, pep_guard_1.PepGuard],
        controllers: [ep_controller_1.EpController],
        exports: [authz_service_1.AuthzService, pep_guard_1.PepGuard],
    })
], AuthzModule);
//# sourceMappingURL=authz.module.js.map