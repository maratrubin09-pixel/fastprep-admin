import { Controller, Post, Get, Body, Param, BadRequestException, UseGuards, Res } from '@nestjs/common';
import { S3Service } from '../storage/s3.service';
import { PepGuard, RequirePerm } from '../authz/pep.guard';
import { Response } from 'express';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'video/mp4'];
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
    if (!ALLOWED_TYPES.includes(dto.contentType)) {
      throw new BadRequestException({ code: 'TYPE_NOT_ALLOWED', message: 'Content type not allowed' });
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
   */
  @Get('download/:key(*)')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async download(@Param('key') key: string, @Res() res: Response) {
    // Проверяем, что ключ начинается с inbox/
    if (!key.startsWith('inbox/')) {
      throw new BadRequestException('Invalid file key');
    }

    try {
      // Получаем presigned URL для скачивания
      const downloadUrl = await this.s3.createPresignedGet(key, 300);
      
      // Редиректим на presigned URL
      res.redirect(downloadUrl);
    } catch (err: any) {
      throw new BadRequestException(err.message || 'Failed to generate download URL');
    }
  }
}


