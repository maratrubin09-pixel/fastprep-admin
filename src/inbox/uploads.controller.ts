import { Controller, Post, Body, BadRequestException, UseGuards } from '@nestjs/common';
import { S3Service } from '../storage/s3.service';
import { PepGuard, RequirePerm } from '../authz/pep.guard';

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
}

