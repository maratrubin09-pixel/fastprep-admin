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
const class_validator_1 = require("class-validator");
const s3_service_1 = require("../storage/s3.service");
const inbox_service_1 = require("./inbox.service");
const pep_guard_1 = require("../authz/pep.guard");
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'video/mp4'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
class SendMessageDto {
    text;
    objectKey;
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMessageDto.prototype, "text", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMessageDto.prototype, "objectKey", void 0);
let MessagesController = class MessagesController {
    s3;
    inbox;
    constructor(s3, inbox) {
        this.s3 = s3;
        this.inbox = inbox;
    }
    /**
     * GET /api/inbox/conversations
     * Get all conversations for the current user
     */
    async getConversations(req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new common_1.BadRequestException('User not authenticated');
        }
        return await this.inbox.getAllConversations();
    }
    /**
     * GET /api/inbox/conversations/:id/messages
     * Get all messages for a conversation
     */
    async getMessages(threadId, req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new common_1.BadRequestException('User not authenticated');
        }
        return await this.inbox.getMessages(threadId);
    }
    /**
     * POST /api/inbox/conversations/:id/messages
     * Валидация objectKey (HEAD: существует, допустимый MIME/размер, префикс inbox/{threadId}/)
     * Транзакция: messages (out, delivery_status='queued') → outbox (pending) → audit_logs
     * Возвращает 201 с полными данными сообщения для немедленного отображения в UI
     */
    async sendMessage(threadId, dto, req) {
        console.log('🔍 DEBUG sendMessage - dto:', JSON.stringify(dto));
        console.log('🔍 DEBUG sendMessage - dto.text:', dto.text, 'type:', typeof dto.text);
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
        // Создание сообщения + outbox + audit (возвращает полные данные сообщения)
        const message = await this.inbox.createOutgoingMessage(threadId, userId, dto.text, dto.objectKey);
        // Возвращаем 201 Created с полными данными сообщения
        return message;
    }
};
exports.MessagesController = MessagesController;
__decorate([
    (0, common_1.Get)('conversations'),
    (0, common_1.UseGuards)(pep_guard_1.PepGuard),
    (0, pep_guard_1.RequirePerm)('inbox.view'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "getConversations", null);
__decorate([
    (0, common_1.Get)('conversations/:id/messages'),
    (0, common_1.UseGuards)(pep_guard_1.PepGuard),
    (0, pep_guard_1.RequirePerm)('inbox.view'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Post)('conversations/:id/messages'),
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
    (0, common_1.Controller)('inbox'),
    __metadata("design:paramtypes", [s3_service_1.S3Service,
        inbox_service_1.InboxService])
], MessagesController);
//# sourceMappingURL=messages.controller.js.map