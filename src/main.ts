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


