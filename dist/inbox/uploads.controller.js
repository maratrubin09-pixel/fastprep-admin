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
exports.UploadsController = void 0;
const common_1 = require("@nestjs/common");
const s3_service_1 = require("../storage/s3.service");
const pep_guard_1 = require("../authz/pep.guard");
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'video/mp4'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
class PresignRequestDto {
    threadId;
    filename;
    contentType;
    size;
}
let UploadsController = class UploadsController {
    s3;
    constructor(s3) {
        this.s3 = s3;
    }
    /**
     * POST /api/inbox/uploads/presign
     * Возвращает { putUrl, objectKey, expiresIn }
     * Ошибки: TYPE_NOT_ALLOWED, SIZE_EXCEEDED
     */
    async presign(dto) {
        if (!ALLOWED_TYPES.includes(dto.contentType)) {
            throw new common_1.BadRequestException({ code: 'TYPE_NOT_ALLOWED', message: 'Content type not allowed' });
        }
        if (dto.size > MAX_SIZE) {
            throw new common_1.BadRequestException({ code: 'SIZE_EXCEEDED', message: 'File size exceeds limit' });
        }
        const prefix = `inbox/${dto.threadId}/`;
        const result = await this.s3.createPresignedPut(prefix, dto.filename, dto.contentType, 600);
        return result;
    }
};
exports.UploadsController = UploadsController;
__decorate([
    (0, common_1.Post)('presign'),
    (0, common_1.UseGuards)(pep_guard_1.PepGuard),
    (0, pep_guard_1.RequirePerm)('inbox.send_message'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PresignRequestDto]),
    __metadata("design:returntype", Promise)
], UploadsController.prototype, "presign", null);
exports.UploadsController = UploadsController = __decorate([
    (0, common_1.Controller)('inbox/uploads'),
    __metadata("design:paramtypes", [s3_service_1.S3Service])
], UploadsController);
//# sourceMappingURL=uploads.controller.js.map