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
// Расширенный список разрешенных типов медиафайлов
const ALLOWED_TYPES = [
    // Изображения
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/bmp',
    'image/svg+xml',
    // Видео
    'video/mp4',
    'video/quicktime', // .mov
    'video/x-msvideo', // .avi
    'video/webm',
    // Аудио
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    // Документы
    'application/pdf',
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.ms-excel', // .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
];
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
        try {
            // Логируем входящие данные для отладки
            console.log('📥 Presign request received:', {
                threadId: dto?.threadId,
                filename: dto?.filename,
                contentType: dto?.contentType,
                size: dto?.size,
                allKeys: Object.keys(dto || {}),
            });
            // Поддержка обоих вариантов названий (camelCase и snake_case)
            const threadId = dto?.threadId || dto?.thread_id;
            const filename = dto?.filename || dto?.fileName;
            const contentType = dto?.contentType || dto?.content_type;
            const size = dto?.size;
            // Валидация входных данных
            if (!threadId || !filename || !contentType || typeof contentType !== 'string') {
                console.error('❌ Missing required fields:', { threadId: !!threadId, filename: !!filename, contentType: !!contentType });
                throw new common_1.BadRequestException({
                    code: 'INVALID_REQUEST',
                    message: 'Missing required fields: threadId, filename, contentType',
                    received: {
                        threadId: !!threadId,
                        filename: !!filename,
                        contentType: !!contentType,
                        allFields: Object.keys(dto || {}),
                    }
                });
            }
            // Нормализуем contentType (убираем пробелы, приводим к нижнему регистру для сравнения)
            const normalizedContentType = contentType.trim().toLowerCase();
            console.log('✅ Validated fields:', { threadId, filename, contentType: normalizedContentType, size });
            // Нормализуем список разрешенных типов для сравнения
            const normalizedAllowedTypes = ALLOWED_TYPES.map(t => t.toLowerCase());
            // Разрешаем все типы, которые начинаются с image/, video/, audio/ или в списке разрешенных
            const isAllowed = normalizedAllowedTypes.includes(normalizedContentType) ||
                normalizedContentType.startsWith('image/') ||
                normalizedContentType.startsWith('video/') ||
                normalizedContentType.startsWith('audio/');
            if (!isAllowed) {
                throw new common_1.BadRequestException({
                    code: 'TYPE_NOT_ALLOWED',
                    message: `Content type not allowed: ${normalizedContentType}. Allowed: images, videos, audio, and documents`
                });
            }
            if (size && size > MAX_SIZE) {
                throw new common_1.BadRequestException({ code: 'SIZE_EXCEEDED', message: 'File size exceeds limit' });
            }
            const prefix = `inbox/${threadId}/`;
            const result = await this.s3.createPresignedPut(prefix, filename, normalizedContentType, 600);
            console.log('✅ Presigned URL generated:', result.objectKey);
            return result;
        }
        catch (error) {
            // Если это уже BadRequestException, пробрасываем дальше
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            // Для других ошибок логируем и возвращаем понятное сообщение
            console.error('Error in presign endpoint:', error);
            throw new common_1.BadRequestException({
                code: 'SERVER_ERROR',
                message: error.message || 'Failed to generate upload URL'
            });
        }
    }
    /**
     * GET /api/inbox/uploads/download/:key
     * Получить presigned URL для скачивания файла или напрямую скачать файл
     * Если есть query параметр ?url=true, возвращает JSON с URL вместо редиректа
     */
    async download(key, req, res) {
        // Проверяем, что ключ начинается с inbox/
        if (!key.startsWith('inbox/')) {
            throw new common_1.BadRequestException('Invalid file key');
        }
        try {
            // Получаем presigned URL для скачивания (3600 секунд = 1 час)
            const downloadUrl = await this.s3.createPresignedGet(key, 3600);
            // Если запрос с ?url=true, возвращаем JSON (для изображений в img src)
            if (req.query?.url === 'true') {
                return res.json({ url: downloadUrl });
            }
            // Иначе редиректим на presigned URL (для скачивания)
            res.redirect(downloadUrl);
        }
        catch (err) {
            throw new common_1.BadRequestException(err.message || 'Failed to generate download URL');
        }
    }
};
exports.UploadsController = UploadsController;
__decorate([
    (0, common_1.Post)('presign'),
    (0, common_1.UseGuards)(pep_guard_1.PepGuard),
    (0, pep_guard_1.RequirePerm)('inbox.send_message'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UploadsController.prototype, "presign", null);
__decorate([
    (0, common_1.Get)('download/:key(*)'),
    (0, common_1.UseGuards)(pep_guard_1.PepGuard),
    (0, pep_guard_1.RequirePerm)('inbox.view'),
    __param(0, (0, common_1.Param)('key')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], UploadsController.prototype, "download", null);
exports.UploadsController = UploadsController = __decorate([
    (0, common_1.Controller)('inbox/uploads'),
    __metadata("design:paramtypes", [s3_service_1.S3Service])
], UploadsController);
//# sourceMappingURL=uploads.controller.js.map