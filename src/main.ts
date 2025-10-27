import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from './auth/jwt.guard';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { 
    cors: true,
    bodyParser: true, // Явно включаем встроенный body parser NestJS
  });
  
  // КРИТИЧЕСКИ ВАЖНО: Body parser ПЕРЕД всеми middleware/guards!
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // DEBUG: Логируем raw body для всех POST запросов
  app.use((req: any, res: any, next: any) => {
    if (req.method === 'POST' && req.path.includes('/messages')) {
      console.log('🔍 RAW REQUEST - path:', req.path);
      console.log('🔍 RAW REQUEST - body:', JSON.stringify(req.body));
      console.log('🔍 RAW REQUEST - headers:', req.headers['content-type']);
    }
    next();
  });
  
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Добавляем глобальный JWT guard
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector));

  const port = process.env.PORT ? Number(process.env.PORT) : 10000;
  await app.listen(port, '0.0.0.0');

  // eslint-disable-next-line no-console
  console.log(`API listening on :${port}`);
}

bootstrap();


