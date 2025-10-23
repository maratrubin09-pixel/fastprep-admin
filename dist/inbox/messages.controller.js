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
exports.MessagesController = void 0;
const common_1 = require("@nestjs/common");
const s3_service_1 = require("../storage/s3.service");
const inbox_service_1 = require("./inbox.service");
const pep_guard_1 = require("../authz/pep.guard");
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'video/mp4'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
class SendMessageDto {
    text;
    objectKey;
}
let MessagesController = class MessagesController {
    s3;
    inbox;
    constructor(s3, inbox) {
        this.s3 = s3;
        this.inbox = inbox;
    }
    /**
     * POST /api/inbox/threads/:id/messages
     * Валидация objectKey (HEAD: существует, допустимый MIME/размер, префикс inbox/{threadId}/)
     * Транзакция: messages (out, delivery_status='queued') → outbox (pending) → audit_logs
     */
    async sendMessage(threadId, dto, req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new common_1.BadRequestException('User not authenticated');
        }
        // Валидация вложения
        if (dto.objectKey) {
            const expectedPrefix = `inbox/${threadId}/`;
            if (!dto.objectKey.startsWith(expectedPrefix)) {
                throw new common_1.BadRequestException({ code: 'FOREIGN_OBJECT', message: 'Object key prefix mismatch' });
            }
            const head = await this.s3.headObject(dto.objectKey);
            if (!head.exists) {
                throw new common_1.BadRequestException({ code: 'FILE_NOT_FOUND', message: 'Attachment not found in S3' });
            }
            if (head.contentType && !ALLOWED_TYPES.includes(head.contentType)) {
                throw new common_1.BadRequestException({ code: 'TYPE_NOT_ALLOWED', message: 'Attachment type not allowed' });
            }
            if (head.size && head.size > MAX_SIZE) {
                throw new common_1.BadRequestException({ code: 'SIZE_EXCEEDED', message: 'Attachment size exceeds limit' });
            }
        }
        // Создание сообщения + outbox + audit
        const messageId = await this.inbox.createOutgoingMessage(threadId, userId, dto.text, dto.objectKey);
        return { status: 'queued', messageId };
    }
};
exports.MessagesController = MessagesController;
__decorate([
    (0, common_1.Post)(':id/messages'),
    (0, common_1.UseGuards)(pep_guard_1.PepGuard),
    (0, pep_guard_1.RequirePerm)('inbox.send_message'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, SendMessageDto, Object]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "sendMessage", null);
exports.MessagesController = MessagesController = __decorate([
    (0, common_1.Controller)('inbox/threads'),
    __metadata("design:paramtypes", [s3_service_1.S3Service,
        inbox_service_1.InboxService])
], MessagesController);
//# sourceMappingURL=messages.controller.js.map