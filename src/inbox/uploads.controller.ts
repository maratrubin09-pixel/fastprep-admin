import { Controller, Post, Get, Body, Param, BadRequestException, UseGuards, Res, Req } from '@nestjs/common';
import { S3Service } from '../storage/s3.service';
import { PepGuard, RequirePerm } from '../authz/pep.guard';
import { Response } from 'express';

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
  threadId!: string;
  filename!: string;
  contentType!: string;
  size!: number;
}

@Controller('inbox/uploads')
export class UploadsController {
  constructor(private s3: S3Service) {}

  /**
   * POST /api/inbox/uploads/presign
   * Возвращает { putUrl, objectKey, expiresIn }
   * Ошибки: TYPE_NOT_ALLOWED, SIZE_EXCEEDED
   */
  @Post('presign')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.send_message')
  async presign(@Body() dto: any) {
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
        throw new BadRequestException({ 
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
      const isAllowed = 
        normalizedAllowedTypes.includes(normalizedContentType) || 
        normalizedContentType.startsWith('image/') || 
        normalizedContentType.startsWith('video/') || 
        normalizedContentType.startsWith('audio/');
      
      if (!isAllowed) {
        throw new BadRequestException({ 
          code: 'TYPE_NOT_ALLOWED', 
          message: `Content type not allowed: ${normalizedContentType}. Allowed: images, videos, audio, and documents` 
        });
      }
      if (size && size > MAX_SIZE) {
        throw new BadRequestException({ code: 'SIZE_EXCEEDED', message: 'File size exceeds limit' });
      }

      const prefix = `inbox/${threadId}/`;
      const result = await this.s3.createPresignedPut(prefix, filename, normalizedContentType, 600);
      
      console.log('✅ Presigned URL generated:', result.objectKey);

      return result;
    } catch (error: any) {
      // Если это уже BadRequestException, пробрасываем дальше
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Для других ошибок логируем и возвращаем понятное сообщение
      console.error('Error in presign endpoint:', error);
      throw new BadRequestException({ 
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
  @Get('download/:key(*)')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async download(@Param('key') key: string, @Req() req: any, @Res() res: Response) {
    // Проверяем, что ключ начинается с inbox/
    if (!key.startsWith('inbox/')) {
      throw new BadRequestException('Invalid file key');
    }

    try {
      // Получаем presigned URL для скачивания
      const downloadUrl = await this.s3.createPresignedGet(key, 300);
      
      // Если запрос с ?url=true, возвращаем JSON (для изображений в img src)
      if (req.query?.url === 'true') {
        return res.json({ url: downloadUrl });
      }
      
      // Иначе редиректим на presigned URL (для скачивания)
      res.redirect(downloadUrl);
    } catch (err: any) {
      throw new BadRequestException(err.message || 'Failed to generate download URL');
    }
  }
}


