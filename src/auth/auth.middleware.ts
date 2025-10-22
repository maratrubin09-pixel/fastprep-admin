import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Простой auth middleware для development
 * В production должен быть заменён на JWT middleware
 * 
 * Для тестирования принимаем header: X-User-Id
 * Или используем дефолтного пользователя
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Проверяем заголовок X-User-Id
    const userIdFromHeader = req.headers['x-user-id'] as string;
    
    if (userIdFromHeader) {
      (req as any).user = { id: userIdFromHeader };
    } else {
      // Дефолтный пользователь для development (можно взять из env)
      const defaultUserId = process.env.DEV_USER_ID || 'dev-user-1';
      (req as any).user = { id: defaultUserId };
    }
    
    next();
  }
}
