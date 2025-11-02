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
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Service = void 0;
const common_1 = require("@nestjs/common");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const client_s3_2 = require("@aws-sdk/client-s3");
const uuid_1 = require("uuid");
let S3Service = class S3Service {
    client;
    bucket;
    constructor() {
        this.client = new client_s3_1.S3Client({
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
    async createPresignedPut(prefix, filename, contentType, expiresIn = 600) {
        const key = `${prefix}${(0, uuid_1.v4)()}_${filename}`;
        const command = new client_s3_2.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
        });
        const putUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.client, command, { expiresIn });
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
    async headObject(key) {
        try {
            const command = new client_s3_1.HeadObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });
            const result = await this.client.send(command);
            return {
                exists: true,
                size: result.ContentLength,
                contentType: result.ContentType,
            };
        }
        catch (err) {
            if (err.name === 'NotFound') {
                return { exists: false };
            }
            throw err;
        }
    }
    /**
     * Генерация presigned GET URL для скачивания файла
     */
    async createPresignedGet(key, expiresIn = 3600) {
        const command = new client_s3_2.GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        return (0, s3_request_presigner_1.getSignedUrl)(this.client, command, { expiresIn });
    }
    /**
     * Загрузить файл напрямую в S3 (для серверных загрузок)
     */
    async putObject(key, body, contentType) {
        const command = new client_s3_2.PutObjectCommand({
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
    async getObject(key) {
        console.log(`📥 getObject: key=${key}, bucket=${this.bucket}, endpoint=${process.env.S3_ENDPOINT}`);
        const command = new client_s3_2.GetObjectCommand({
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
        }
        catch (error) {
            console.error(`❌ Error getting object from S3: key=${key}, error=${error.message || error}`);
            throw error;
        }
        // AWS SDK v3 возвращает Readable stream
        // Конвертируем stream в Buffer
        const chunks = [];
        const stream = response.Body;
        // Проверяем, есть ли метод transformToByteArray (для AWS SDK v3)
        if (typeof stream.transformToByteArray === 'function') {
            const buffer = await stream.transformToByteArray();
            return {
                body: Buffer.from(buffer),
                contentType: response.ContentType,
            };
        }
        // Fallback для стандартного Node.js stream
        return new Promise((resolve, reject) => {
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve({
                    body: buffer,
                    contentType: response.ContentType,
                });
            });
            stream.on('error', reject);
        });
    }
};
exports.S3Service = S3Service;
exports.S3Service = S3Service = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], S3Service);
//# sourceMappingURL=s3.service.js.map