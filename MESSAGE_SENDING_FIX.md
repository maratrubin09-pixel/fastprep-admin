# Исправление: Невозможность отправки сообщений

## Проблема

Пользователи не могли отправлять сообщения через API endpoint `POST /api/inbox/threads/:id/messages`.

## Причина

Код приложения ожидал, что JWT middleware установит `req.user` для всех аутентифицированных запросов, но:

1. **JWT middleware не был реализован** (отмечен как "⏳ JWT middleware (auth guards)" в DEPLOYMENT_GUIDE.md)
2. **Отсутствующие зависимости** - npm packages не были установлены
3. **TypeScript ошибки** в коде препятствовали сборке проекта

Без `req.user`:
- `PepGuard` выбрасывал `ForbiddenException('User not authenticated')`
- `MessagesController.sendMessage()` выбрасывал `BadRequestException('User not authenticated')`

## Решение

### 1. Установка зависимостей
```bash
npm install
npm install --save-dev @types/pg
```

### 2. Создан простой auth middleware для разработки

**Файл:** `/src/auth/auth.middleware.ts`

Middleware автоматически устанавливает `req.user` для всех запросов:
- По умолчанию использует `dev-user-1` (или значение из `DEV_USER_ID` env var)
- Принимает заголовок `X-User-Id` для тестирования с конкретным пользователем

### 3. Подключен middleware к приложению

**Файл:** `/src/modules/app.module.ts`

```typescript
import { AuthMiddleware } from '../auth/auth.middleware';

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .forRoutes('*');
  }
}
```

### 4. Исправлены TypeScript ошибки

- **ws.gateway.ts:81** - добавлена проверка `data` на undefined
- **worker.service.ts:141,144** - добавлено значение по умолчанию для `errorMessage`

## Тестирование

### Отправка сообщения с дефолтным пользователем

```bash
curl -X POST http://localhost:3000/api/inbox/threads/thread-123/messages \
  -H "Content-Type: application/json" \
  -d '{"text": "Тестовое сообщение"}'
```

### Отправка сообщения от конкретного пользователя

```bash
curl -X POST http://localhost:3000/api/inbox/threads/thread-123/messages \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-abc-123" \
  -d '{"text": "Тестовое сообщение от user-abc-123"}'
```

### Отправка сообщения с вложением

```bash
curl -X POST http://localhost:3000/api/inbox/threads/thread-123/messages \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-abc-123" \
  -d '{
    "text": "Сообщение с вложением",
    "objectKey": "inbox/thread-123/file-xyz.pdf"
  }'
```

## Важные замечания

### ⚠️ Безопасность

**НЕ ИСПОЛЬЗОВАТЬ В PRODUCTION!**

Текущий auth middleware предназначен только для локальной разработки. В production необходимо:

1. Реализовать JWT authentication
2. Использовать `@nestjs/passport` + `@nestjs/jwt`
3. Проверять JWT токены из заголовка `Authorization: Bearer <token>`

### Следующие шаги

1. ✅ Dependencies установлены
2. ✅ Auth middleware для dev создан
3. ✅ TypeScript ошибки исправлены
4. ✅ Build проходит успешно
5. ⏳ Реализовать JWT authentication для production
6. ⏳ Добавить unit/e2e тесты

## Документация

- **Auth middleware:** `/src/auth/README.md`
- **API endpoints:** `/README.md#api-endpoints`
- **Deployment:** `/DEPLOYMENT_GUIDE.md`

## Технические детали

### Изменённые файлы

1. **Новые файлы:**
   - `/src/auth/auth.middleware.ts` - простой auth middleware
   - `/src/auth/README.md` - документация по authentication
   - `/workspace/MESSAGE_SENDING_FIX.md` - этот документ

2. **Изменённые файлы:**
   - `/src/modules/app.module.ts` - подключен AuthMiddleware
   - `/src/inbox/ws.gateway.ts` - исправлена TypeScript ошибка
   - `/src/worker/worker.service.ts` - исправлены TypeScript ошибки
   - `/README.md` - добавлена секция про authentication
   - `/package.json` (косвенно, через npm install)

### Проверка сборки

```bash
npm run build
# ✅ Должна пройти успешно без ошибок
```

### Запуск приложения

```bash
# Терминал 1: API
npm run start:dev

# Терминал 2: Worker (опционально)
npm run start:worker
```

## Результат

✅ Теперь можно отправлять сообщения через API без ошибок аутентификации
✅ Build проходит успешно
✅ Все TypeScript ошибки исправлены
✅ Документация обновлена
