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
const telegram_service_1 = require("../messengers/telegram/telegram.service");
const pep_guard_1 = require("../authz/pep.guard");
// Расширенный список разрешенных типов (должен совпадать с uploads.controller.ts)
const ALLOWED_TYPES = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'image/heic', 'image/heif', 'image/bmp', 'image/svg+xml',
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
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
    telegramService;
    constructor(s3, inbox, telegramService) {
        this.s3 = s3;
        this.inbox = inbox;
        this.telegramService = telegramService;
    }
    /**
     * GET /api/inbox/conversations
     * Get all conversations for the current user (excluding archived)
     * @query platform Optional platform filter (e.g., 'telegram', 'whatsapp')
     */
    async getConversations(req, platform) {
        const userId = req.user?.id;
        if (!userId) {
            throw new common_1.BadRequestException('User not authenticated');
        }
        return await this.inbox.getAllConversations(platform);
    }
    /**
     * GET /api/inbox/conversations/archived
     * Get all archived conversations
     */
    async getArchivedConversations(req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new common_1.BadRequestException('User not authenticated');
        }
        return await this.inbox.getArchivedConversations();
    }
    /**
     * GET /api/inbox/conversations/:id/messages
     * Get all messages for a conversation and mark as read
     */
    async getMessages(threadId, req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new common_1.BadRequestException('User not authenticated');
        }
        // Mark conversation as read when opening it
        await this.inbox.markConversationAsRead(threadId);
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
            // Разрешаем все типы, которые начинаются с image/, video/, audio/ или в списке разрешенных
            const isAllowed = head.contentType && (ALLOWED_TYPES.includes(head.contentType) ||
                head.contentType.startsWith('image/') ||
                head.contentType.startsWith('video/') ||
                head.contentType.startsWith('audio/'));
            if (!isAllowed) {
                throw new common_1.BadRequestException({
                    code: 'TYPE_NOT_ALLOWED',
                    message: `Attachment type not allowed: ${head.contentType}`
                });
            }
            if (head.size && head.size > MAX_SIZE) {
                throw new common_1.BadRequestException({ code: 'SIZE_EXCEEDED', message: 'Attachment size exceeds limit' });
            }
        }
        // Создание сообщения + outbox + audit (возвращает полные данные сообщения)
        console.log(`📤 Creating outgoing message: threadId=${threadId}, userId=${userId}, hasObjectKey=${!!dto.objectKey}, objectKey=${dto.objectKey || 'null'}`);
        console.log(`📤 Full DTO received:`, JSON.stringify({ text: dto.text, objectKey: dto.objectKey, textLength: dto.text?.length || 0 }));
        const message = await this.inbox.createOutgoingMessage(threadId, userId, dto.text, dto.objectKey);
        console.log(`✅ Outgoing message created successfully: messageId=${message.id}, hasObjectKey=${!!message.object_key}, objectKey=${message.object_key || 'null'}`);
        // Возвращаем 201 Created с полными данными сообщения
        // Явно добавляем object_key и objectKey для совместимости с frontend
        return {
            ...message,
            object_key: message.object_key,
            objectKey: message.object_key, // camelCase для совместимости
        };
    }
    /**
     * POST /api/inbox/conversations/:id/archive
     * Archive a conversation
     */
    async archiveConversation(threadId, req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new common_1.BadRequestException('User not authenticated');
        }
        await this.inbox.archiveConversation(threadId);
        return { success: true };
    }
    /**
     * PUT /api/inbox/conversations/:id
     * Update conversation (e.g., custom_name)
     */
    async updateConversation(threadId, body, req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new common_1.BadRequestException('User not authenticated');
        }
        await this.inbox.updateConversation(threadId, body);
        return { success: true };
    }
    /**
     * POST /api/inbox/telegram/find-and-start
     * Find and start a Telegram chat by username or phone
     */
    async findAndStartChat(body, req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new common_1.BadRequestException('User not authenticated');
        }
        if (!body.username && !body.phone) {
            throw new common_1.BadRequestException('Either username or phone must be provided');
        }
        try {
            // Find user in Telegram
            const userData = await this.telegramService.findAndStartChat(body.username, body.phone);
            // Create or find conversation thread
            const channelId = `telegram:${userData.userId}`;
            const thread = await this.inbox.findOrCreateThread({
                channel_id: channelId,
                platform: 'telegram',
                chat_title: userData.chatTitle,
                chat_type: 'private',
                telegram_peer_id: userData.telegramPeerId,
                sender_phone: userData.phone,
                sender_username: userData.username,
                sender_first_name: userData.firstName,
                sender_last_name: userData.lastName,
            });
            return {
                success: true,
                conversation: thread,
                user: userData,
            };
        }
        catch (error) {
            throw new common_1.BadRequestException(error.message || 'Failed to find and start chat');
        }
    }
    /**
     * GET /api/inbox/conversations/trash
     * Get all deleted conversations
     */
    async getDeletedConversations(req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new common_1.BadRequestException('User not authenticated');
        }
        return await this.inbox.getDeletedConversations();
    }
    /**
     * POST /api/inbox/conversations/:id/restore
     * Restore a deleted conversation
     */
    async restoreConversation(threadId, req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new common_1.BadRequestException('User not authenticated');
        }
        await this.inbox.restoreConversation(threadId);
        return { success: true };
    }
    /**
     * DELETE /api/inbox/conversations/:id
     * Удалить чат (soft delete для корзины)
     */
    async deleteConversation(threadId, req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new common_1.BadRequestException('User not authenticated');
        }
        return await this.inbox.deleteConversation(threadId);
    }
};
exports.MessagesController = MessagesController;
__decorate([
    (0, common_1.Get)('conversations'),
    (0, common_1.UseGuards)(pep_guard_1.PepGuard),
    (0, pep_guard_1.RequirePerm)('inbox.view'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "getConversations", null);
__decorate([
    (0, common_1.Get)('conversations/archived'),
    (0, common_1.UseGuards)(pep_guard_1.PepGuard),
    (0, pep_guard_1.RequirePerm)('inbox.view'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "getArchivedConversations", null);
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
__decorate([
    (0, common_1.Post)('conversations/:id/archive'),
    (0, common_1.UseGuards)(pep_guard_1.PepGuard),
    (0, pep_guard_1.RequirePerm)('inbox.view'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "archiveConversation", null);
__decorate([
    (0, common_1.Put)('conversations/:id'),
    (0, common_1.UseGuards)(pep_guard_1.PepGuard),
    (0, pep_guard_1.RequirePerm)('inbox.view'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "updateConversation", null);
__decorate([
    (0, common_1.Post)('telegram/find-and-start'),
    (0, common_1.UseGuards)(pep_guard_1.PepGuard),
    (0, pep_guard_1.RequirePerm)('inbox.send_message'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "findAndStartChat", null);
__decorate([
    (0, common_1.Get)('conversations/trash'),
    (0, common_1.UseGuards)(pep_guard_1.PepGuard),
    (0, pep_guard_1.RequirePerm)('inbox.view'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "getDeletedConversations", null);
__decorate([
    (0, common_1.Post)('conversations/:id/restore'),
    (0, common_1.UseGuards)(pep_guard_1.PepGuard),
    (0, pep_guard_1.RequirePerm)('inbox.view'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "restoreConversation", null);
__decorate([
    (0, common_1.Delete)('conversations/:id'),
    (0, common_1.UseGuards)(pep_guard_1.PepGuard),
    (0, pep_guard_1.RequirePerm)('inbox.view'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "deleteConversation", null);
exports.MessagesController = MessagesController = __decorate([
    (0, common_1.Controller)('inbox'),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => telegram_service_1.TelegramService))),
    __metadata("design:paramtypes", [s3_service_1.S3Service,
        inbox_service_1.InboxService,
        telegram_service_1.TelegramService])
], MessagesController);
//# sourceMappingURL=messages.controller.js.map