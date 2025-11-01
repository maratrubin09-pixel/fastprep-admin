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
    
    // Логирование для отладки
    console.log('🔗 Generated presigned PUT URL:', {
      key,
      bucket: this.bucket,
      endpoint: process.env.S3_ENDPOINT,
      urlPreview: putUrl.substring(0, 100) + '...',
    });

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
  async createPresignedGet(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Загрузить файл напрямую в S3 (для серверных загрузок)
   */
  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    
    await this.client.send(command);
    console.log(`✅ File uploaded to S3: ${key}`);
  }

  /**
   * Скачать файл из S3
   */
  async getObject(key: string): Promise<{ body: Buffer; contentType?: string }> {
    console.log(`📥 getObject: key=${key}, bucket=${this.bucket}, endpoint=${process.env.S3_ENDPOINT}`);
    
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    
    let response;
    try {
      response = await this.client.send(command);
      
      if (!response.Body) {
        console.error(`❌ File not found in S3: ${key}`);
        throw new Error(`File not found in S3: ${key}`);
      }
      
      console.log(`✅ Object retrieved from S3: key=${key}, contentType=${response.ContentType || 'unknown'}, contentLength=${response.ContentLength || 'unknown'}`);
    } catch (error: any) {
      console.error(`❌ Error getting object from S3: key=${key}, error=${error.message || error}`);
      throw error;
    }

    // AWS SDK v3 возвращает Readable stream
    // Конвертируем stream в Buffer
    const chunks: Uint8Array[] = [];
    const stream = response!.Body as any;
    
    // Проверяем, есть ли метод transformToByteArray (для AWS SDK v3)
    if (typeof stream.transformToByteArray === 'function') {
      const buffer = await stream.transformToByteArray();
      return {
        body: Buffer.from(buffer),
        contentType: response!.ContentType,
      };
    }
    
    // Fallback для стандартного Node.js stream
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          body: buffer,
          contentType: response!.ContentType,
        });
      });
      stream.on('error', reject);
    });
  }
}


