# Полный список изменений после бекапа - PR1-PR9

## Дата: Ноябрь 2025

---

## PR1: Internal Notes (Внутренние заметки)

### Backend:
- ✅ Создана таблица `conversation_notes` (миграция `201_notes.sql`)
- ✅ Создан `NotesService` (`src/inbox/services/notes.service.ts`):
  - `get(conversationId, userId)` - получение заметки
  - `upsert(conversationId, userId, noteText)` - создание/обновление
  - `remove(conversationId, userId)` - удаление
  - HTML sanitization для безопасности
- ✅ Создан `NotesController` (`src/inbox/controllers/notes.controller.ts`):
  - `GET /api/inbox/conversations/:id/notes`
  - `POST /api/inbox/conversations/:id/notes`
  - `DELETE /api/inbox/conversations/:id/notes`
- ✅ WebSocket события: `note.upserted`, `note.deleted`

### Frontend:
- ✅ Компонент `NotePanel` (уже был создан ранее)

---

## PR2: Pinned Messages (Закрепленные сообщения)

### Backend:
- ✅ Миграция `202_pins.sql`:
  - Колонки: `is_pinned`, `pinned_at`, `pinned_by`, `pinned_order`
  - Unique index для ограничения порядка
- ✅ Методы в `InboxService`:
  - `pinMessage(messageId, userId, order?)` - закрепить (максимум 5 на чат)
  - `unpinMessage(messageId)` - открепить
  - `getPinnedMessages(conversationId)` - получить топ 5 закрепленных
- ✅ Endpoints в `MessagesController`:
  - `POST /api/inbox/messages/:id/pin`
  - `DELETE /api/inbox/messages/:id/pin`
  - `GET /api/inbox/conversations/:id/pinned`
- ✅ Права доступа: `inbox.view` (исправлено с `inbox.pin`)

### Frontend:
- ✅ UI для pinned messages (уже был реализован ранее)

---

## PR3: Media Thumbnails (Превью медиа)

### Backend:
- ✅ Миграция `203_media.sql`:
  - Таблица `message_media` (id, message_id, kind, storage_key, thumb_storage_key, content_type, width, height, size_bytes)
  - Индексы для быстрого поиска
  - Колонка `has_attachments` в `messages`
- ✅ Метод `getMediaMessages(conversationId, kind, cursor?, limit)` - курсорная пагинация
- ✅ Endpoint `GET /api/inbox/conversations/:id/media?kind=image&cursor=...`
- ✅ Endpoint `GET /api/inbox/uploads/thumbnail/:id` для получения presigned URL

---

## PR4: Stickers (Стикеры)

### Backend:
- ✅ Миграция `204_stickers.sql`:
  - Таблица `message_stickers` (id, message_id, sticker_id, sticker_set_id, emoji)
- ✅ Поддержка `stickerId` в `SendMessageDto`
- ✅ Метод `sendSticker(conversationId, stickerId)` в `TelegramService`
- ✅ Сохранение стикера в БД при создании сообщения
- ✅ Исправление: использование `sendMessage` вместо `sendFile` для стикеров

---

## PR5: Online Status (Онлайн статус)

### Backend:
- ✅ Сервис `PresenceService` (`src/inbox/services/presence.service.ts`):
  - `setOnline(userId)` - отметить как онлайн
  - `setOffline(userId)` - отметить как офлайн
  - `isOnline(userId)` - проверить статус
  - `getLastSeen(userId)` - получить последний визит
  - `getOnlineUsers()` - список онлайн пользователей
  - `updateLastSeen(userId)` - обновить heartbeat
- ✅ Redis-based хранение (`presence:online`, `presence:lastSeen:*`)
- ✅ WebSocket события:
  - `user.online` - пользователь онлайн
  - `user.offline` - пользователь офлайн
  - `presence:heartbeat` - heartbeat событие
- ✅ Endpoints:
  - `GET /api/inbox/users/online`
  - `GET /api/inbox/conversations/:id/participants/status`
- ✅ Автоматическое обновление статуса при подключении/отключении WebSocket

---

## PR6: Last Message Preview (Превью последнего сообщения)

### Backend:
- ✅ Колонка `last_message_preview` в таблице `conversations`
- ✅ Автоматическое обновление preview при отправке сообщения:
  - Текст (первые 100 символов)
  - `[Sticker]` для стикеров
  - `[Photo]` для изображений
  - `[Video]` для видео
  - `[Voice]` для аудио
  - `[File]` для других файлов

---

## PR7: Mute (Мут чатов)

### Backend:
- ✅ Миграция `206_mute.sql`:
  - Таблица `conversation_user_settings` (conversation_id, user_id, is_muted, muted_until)
  - Unique constraint на (conversation_id, user_id)
- ✅ Сервис `ConversationSettingsService` (`src/inbox/services/conversation-settings.service.ts`):
  - `muteConversation(conversationId, userId, until?)` - замутить
  - `unmuteConversation(conversationId, userId)` - размутить
  - `getSettings(conversationId, userId)` - получить настройки
  - `isMuted(conversationId, userId)` - проверить статус (с авто-размутом при истечении)
- ✅ Endpoints:
  - `POST /api/inbox/conversations/:id/mute`
  - `POST /api/inbox/conversations/:id/unmute`
  - `GET /api/inbox/conversations/:id/settings`

---

## PR8: Profile View (Профиль собеседника)

### Backend:
- ✅ Миграция `207_profile.sql`:
  - Колонки: `sender_photo_url`, `sender_bio`, `sender_verified`
- ✅ Метод `getConversationStats(conversationId)` в `InboxService`:
  - Статистика сообщений (total_messages, first_message_at, last_message_at)
- ✅ Расширен `updateConversation` для профиля
- ✅ Endpoints:
  - `GET /api/inbox/conversations/:id/profile` - получить профиль (с presence и stats)
  - `PUT /api/inbox/conversations/:id/profile` - обновить профиль (только админ)
- ✅ Права: `inbox.profile.read`, `inbox.profile.manage`

---

## PR9: WS Events, Права, Метрики

### WebSocket:
- ✅ Событие `presence:heartbeat` для обновления last seen
- ✅ События `user.online` / `user.offline` для статусов
- ✅ События `note.upserted` / `note.deleted` для заметок

### Права доступа:
- ✅ `inbox.view` - для pin/unpin (исправлено)
- ✅ `inbox.profile.read` - чтение профиля
- ✅ `inbox.profile.manage` - управление профилем
- ✅ `inbox.mute` - для mute операций

### Экспорты модулей:
- ✅ `PresenceService` экспортирован
- ✅ `ConversationSettingsService` экспортирован
- ✅ `NotesService` экспортирован

---

## Исправления багов

### TypeScript ошибки:
- ✅ `ep` is possibly 'null' - добавлена проверка `!ep ||`
- ✅ `result.rowCount` is possibly 'null' - используется `?? 0`
- ✅ `sticker` в `sendFile` - заменено на `sendMessage` с `file`

### Endpoints:
- ✅ Миграция БД: `@All('migrate')` вместо `@Post`/`@Get` для поддержки обоих методов

### Права доступа:
- ✅ Pin/Unpin: изменено с `inbox.pin` на `inbox.view`

---

## Файлы миграций

1. `migrations/201_notes.sql` - Internal Notes
2. `migrations/202_pins.sql` - Pinned Messages
3. `migrations/203_media.sql` - Media Thumbnails
4. `migrations/204_stickers.sql` - Stickers
5. `migrations/206_mute.sql` - Mute (пропущен 205)
6. `migrations/207_profile.sql` - Profile View

---

## Новые сервисы

1. `src/inbox/services/notes.service.ts` - управление заметками
2. `src/inbox/services/presence.service.ts` - онлайн статус
3. `src/inbox/services/conversation-settings.service.ts` - настройки чатов (mute)

---

## Обновленные файлы

### Backend:
- `src/inbox/inbox.service.ts` - добавлены методы для pin, media, stats, preview
- `src/inbox/messages.controller.ts` - новые endpoints для всех PR'ов
- `src/inbox/ws.gateway.ts` - presence события, heartbeat
- `src/inbox/inbox.module.ts` - регистрация новых сервисов
- `src/inbox/uploads.controller.ts` - thumbnail endpoint
- `src/messengers/telegram/telegram.service.ts` - sendSticker метод
- `src/routes/init-db.controller.ts` - все миграции PR1-PR8

---

## Итог

✅ **Все 9 PR'ов реализованы полностью**
✅ **Все миграции добавлены в init-db.controller.ts**
✅ **Все TypeScript ошибки исправлены**
✅ **Права доступа настроены корректно**
✅ **Готово к деплою после миграции БД**

