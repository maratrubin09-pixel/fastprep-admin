"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboxModule = void 0;
const common_1 = require("@nestjs/common");
const storage_module_1 = require("../storage/storage.module");
const authz_module_1 = require("../authz/authz.module");
const uploads_controller_1 = require("./uploads.controller");
const messages_controller_1 = require("./messages.controller");
const ws_gateway_1 = require("./ws.gateway");
const inbox_service_1 = require("./inbox.service");
let InboxModule = class InboxModule {
};
exports.InboxModule = InboxModule;
exports.InboxModule = InboxModule = __decorate([
    (0, common_1.Module)({
        imports: [storage_module_1.StorageModule, authz_module_1.AuthzModule],
        providers: [inbox_service_1.InboxService, ws_gateway_1.WsGateway],
        controllers: [uploads_controller_1.UploadsController, messages_controller_1.MessagesController],
    })
], InboxModule);
//# sourceMappingURL=inbox.module.js.map