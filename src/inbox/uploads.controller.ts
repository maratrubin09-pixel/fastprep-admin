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
  async presign(@Body() dto: PresignRequestDto) {
    // Разрешаем все типы, которые начинаются с image/, video/, audio/ или в списке разрешенных
    const isAllowed = 
      ALLOWED_TYPES.includes(dto.contentType) || 
      dto.contentType.startsWith('image/') || 
      dto.contentType.startsWith('video/') || 
      dto.contentType.startsWith('audio/');
    
    if (!isAllowed) {
      throw new BadRequestException({ 
        code: 'TYPE_NOT_ALLOWED', 
        message: `Content type not allowed: ${dto.contentType}. Allowed: images, videos, audio, and documents` 
      });
    }
    if (dto.size > MAX_SIZE) {
      throw new BadRequestException({ code: 'SIZE_EXCEEDED', message: 'File size exceeds limit' });
    }

    const prefix = `inbox/${dto.threadId}/`;
    const result = await this.s3.createPresignedPut(prefix, dto.filename, dto.contentType, 600);

    return result;
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


