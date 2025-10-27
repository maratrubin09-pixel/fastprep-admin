import { Injectable } from '@nestjs/common';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

export interface PresignedPutResult {
  putUrl: string;
  objectKey: string;
  expiresIn: number;
}

@Injectable()
export class S3Service {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'auto',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      },
    });
    this.bucket = process.env.S3_BUCKET || 'fastprep-attachments';
  }

  /**
   * Генерация presigned PUT URL для загрузки файла
   * @param prefix - префикс ключа (например, inbox/{threadId}/)
   * @param filename - имя файла
   * @param contentType - MIME тип
   * @param expiresIn - время жизни URL в секундах (по умолчанию 600)
   */
  async createPresignedPut(
    prefix: string,
    filename: string,
    contentType: string,
    expiresIn = 600
  ): Promise<PresignedPutResult> {
    const key = `${prefix}${uuidv4()}_${filename}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const putUrl = await getSignedUrl(this.client, command, { expiresIn });

    return { putUrl, objectKey: key, expiresIn };
  }

  /**
   * Проверка существования объекта и получение его метаданных (HEAD)
   */
  async headObject(key: string): Promise<{ exists: boolean; size?: number; contentType?: string }> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const result = await this.client.send(command);
      return {
        exists: true,
        size: result.ContentLength,
        contentType: result.ContentType,
      };
    } catch (err: any) {
      if (err.name === 'NotFound') {
        return { exists: false };
      }
      throw err;
    }
  }

  /**
   * Генерация presigned GET URL для скачивания файла
   */
  async createPresignedGet(key: string, expiresIn = 300): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }
}






