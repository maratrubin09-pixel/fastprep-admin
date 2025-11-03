# План работы для архитектора - Вторая половина функций Inbox

## Текущий статус

### ✅ Реализовано (первая половина):
1. Edit messages - редактирование отправленных сообщений
2. Better timestamps - улучшенные временные метки
3. Message grouping - группировка сообщений от одного отправителя
4. Link previews - превью ссылок
5. Markdown support - форматирование текста
6. Voice messages - базовая отправка и воспроизведение
7. Media tabs - вкладки для фото/видео/файлов
8. Message reactions - эмодзи реакции
9. Typing indicator - индикатор набора текста
10. Delivery status - расширенные статусы доставки
11. Message templates - шаблоны сообщений
12. Drafts - черновики сообщений
13. Emoji picker - выбор эмодзи

### ⚠️ Требуют проверки/доработки:
- Edit messages - кнопка видна, но может не работать полностью
- Typing indicator - добавлен WebSocket handler, но нужно проверить работу
- Delivery status - нужно убедиться что статусы обновляются через WebSocket
- Voice messages - нужно проверить получение presigned URLs
- Media tabs - фильтрация реализована, но нужно проверить корректность работы
- Message reactions - API добавлен, но нужно проверить сохранение и отображение

---

## Задачи для реализации (вторая половина)

### 1. Internal Notes (Внутренние заметки к чатам)

#### Backend задачи:
- **База данных:**
  - Создать таблицу `conversation_notes`:
    ```sql
    CREATE TABLE conversation_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      note_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(conversation_id, user_id)
    );
    CREATE INDEX idx_conversation_notes_conversation_id ON conversation_notes(conversation_id);
    ```

- **API Endpoints:**
  - `GET /api/inbox/conversations/:id/notes` - получить заметки для чата
  - `POST /api/inbox/conversations/:id/notes` - создать/обновить заметку
  - `PUT /api/inbox/conversations/:id/notes` - обновить заметку
  - `DELETE /api/inbox/conversations/:id/notes` - удалить заметку

- **Service методы:**
  - `InboxService.getConversationNotes(conversationId: string, userId: string)`
  - `InboxService.saveConversationNote(conversationId: string, userId: string, noteText: string)`
  - `InboxService.deleteConversationNote(conversationId: string, userId: string)`

#### Frontend задачи:
- Добавить иконку заметки в header чата (справа от названия)
- Создать компонент `NotePanel` - боковая панель или модальное окно для заметок
- Сохранять заметки в localStorage как fallback
- Показывать индикатор, если есть заметки (маленький значок)

---

### 2. Pinned Messages (Закрепленные сообщения)

#### Backend задачи:
- **База данных:**
  - Добавить колонку в таблицу `messages`:
    ```sql
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES users(id);
    CREATE INDEX idx_messages_is_pinned ON messages(conversation_id, is_pinned) WHERE is_pinned = true;
    ```

- **API Endpoints:**
  - `POST /api/inbox/messages/:id/pin` - закрепить сообщение
  - `DELETE /api/inbox/messages/:id/pin` - открепить сообщение
  - `GET /api/inbox/conversations/:id/pinned` - получить все закрепленные сообщения чата

- **Service методы:**
  - `InboxService.pinMessage(messageId: string, userId: string)`
  - `InboxService.unpinMessage(messageId: string, userId: string)`
  - `InboxService.getPinnedMessages(conversationId: string)`

#### Frontend задачи:
- Добавить кнопку "Pin" в actions menu сообщения (иконка булавки)
- Создать секцию "Pinned Messages" вверху списка сообщений
- При клике на закрепленное сообщение - прокручивать к оригиналу в чате
- Ограничить количество закрепленных (например, максимум 5 на чат)

---

### 3. Faster Media Loading (Оптимизация загрузки медиа)

#### Backend задачи:
- **Оптимизация:**
  - Реализовать lazy loading для медиа через пагинацию
  - Добавить thumbnail generation для изображений (при загрузке создавать уменьшенные копии)
  - Кэширование presigned URLs в Redis (TTL 1 час)
  - Оптимизировать запросы к S3/R2

- **API Endpoints:**
  - `GET /api/inbox/conversations/:id/media?type=photo&page=1&limit=20` - получить медиа с пагинацией
  - `GET /api/inbox/uploads/thumbnail/:objectKey` - получить thumbnail

- **Service методы:**
  - `InboxService.getMediaMessages(conversationId: string, type: string, page: number, limit: number)`
  - `S3Service.getThumbnailUrl(objectKey: string)` - для генерации/получения thumbnails

#### Frontend задачи:
- Использовать Intersection Observer для lazy loading изображений
- Показывать placeholder/skeleton при загрузке
- Preload следующую страницу медиа при скролле
- Оптимизировать рендеринг больших списков медиа (виртуализация)

---

### 4. Stickers Support (Поддержка стикеров)

#### Backend задачи:
- **База данных:**
  - Расширить таблицу `messages.metadata` для хранения sticker_id
  - Или создать таблицу `message_stickers`:
    ```sql
    CREATE TABLE message_stickers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      sticker_id TEXT NOT NULL,
      sticker_set_id TEXT,
      emoji TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ```

- **API Endpoints:**
  - `POST /api/inbox/conversations/:id/messages` - отправка сообщения (расширить для поддержки sticker_id)
  - Для Telegram: использовать существующий `TelegramService.sendMessage` с поддержкой стикеров

- **Service методы:**
  - Расширить `InboxService.sendMessage` для обработки sticker_id
  - `TelegramService.sendSticker(conversationId: string, stickerId: string)`

#### Frontend задачи:
- Добавить кнопку стикеров в input toolbar (рядом с emoji picker)
- Создать компонент `StickerPicker` - модальное окно с категориями стикеров
- Для Telegram: интегрировать с Telegram Bot API для получения доступных стикер-паков
- Отображать стикеры как изображения в чате

---

### 5. Online Status (Статус онлайн пользователей)

#### Backend задачи:
- **База данных:**
  - Использовать Redis для хранения online статусов:
    - Ключ: `user:online:{userId}` → timestamp последней активности
    - TTL: 5 минут (если не обновляется - считается offline)

- **WebSocket:**
  - Событие `user:online` - при подключении пользователя
  - Событие `user:offline` - при отключении или таймауте
  - Heartbeat каждые 2 минуты для обновления статуса

- **API Endpoints:**
  - `GET /api/inbox/users/online` - получить список онлайн пользователей
  - `GET /api/inbox/conversations/:id/participants/status` - статус участников чата

- **Service методы:**
  - `InboxService.updateUserOnlineStatus(userId: string)`
  - `InboxService.getUserOnlineStatus(userId: string): Promise<boolean>`
  - `WsGateway.handleUserConnection` - обновлять статус при подключении
  - `WsGateway.handleUserDisconnection` - обновлять статус при отключении

#### Frontend задачи:
- Показывать зеленый индикатор онлайн в списке чатов (рядом с аватаром)
- Отображать "Last seen X minutes ago" если offline
- Обновлять статус через WebSocket события
- Heartbeat каждые 2 минуты для поддержания статуса онлайн

---

### 6. Last Message Preview (Превью последнего сообщения в списке)

#### Backend задачи:
- **База данных:**
  - Уже есть поле `last_message_at` в `conversations`
  - Добавить поле `last_message_preview`:
    ```sql
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
    CREATE INDEX idx_conversations_last_message_at ON conversations(last_message_at DESC);
    ```

- **Логика:**
  - При создании нового сообщения обновлять `last_message_preview` в conversation
  - Обрезать текст до 100 символов
  - Для медиа: показывать "[Photo]", "[Video]", "[File]", "[Voice]"

- **Service методы:**
  - Обновить `InboxService.sendMessage` для обновления preview
  - `InboxService.updateLastMessagePreview(conversationId: string, preview: string)`

#### Frontend задачи:
- Отображать превью под названием чата в списке
- Обрезать длинные тексты с ellipsis
- Показывать иконку типа медиа для медиа-сообщений
- Выделять непрочитанные сообщения (жирным шрифтом)

---

### 7. Mute Icon (Иконка отключения уведомлений)

#### Backend задачи:
- **База данных:**
  - Добавить колонку в `conversations`:
    ```sql
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;
    CREATE INDEX idx_conversations_is_muted ON conversations(is_muted) WHERE is_muted = true;
    ```

- **API Endpoints:**
  - `POST /api/inbox/conversations/:id/mute` - заглушить чат
  - `POST /api/inbox/conversations/:id/unmute` - включить уведомления
  - Поддержка временного мута: `muted_until` (например, на 1 час, до завтра, навсегда)

- **Service методы:**
  - `InboxService.muteConversation(conversationId: string, userId: string, until?: Date)`
  - `InboxService.unmuteConversation(conversationId: string, userId: string)`
  - `InboxService.isConversationMuted(conversationId: string): Promise<boolean>`

#### Frontend задачи:
- Добавить иконку "Mute" в header чата (колокольчик с перечеркиванием)
- Показывать индикатор в списке чатов для заглушенных чатов
- При клике открывать меню: "Mute for 1 hour", "Mute for 8 hours", "Mute until tomorrow", "Mute forever"
- При отправке сообщения в заглушенный чат - автоматически размутить

---

### 8. Profile View (Просмотр профиля собеседника)

#### Backend задачи:
- **База данных:**
  - Использовать существующие поля в `conversations`:
    - `sender_phone`, `sender_username`, `sender_first_name`, `sender_last_name`
    - Добавить поля для профиля:
      ```sql
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sender_photo_url TEXT;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sender_bio TEXT;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sender_verified BOOLEAN DEFAULT false;
      ```

- **API Endpoints:**
  - `GET /api/inbox/conversations/:id/profile` - получить профиль собеседника
  - `PUT /api/inbox/conversations/:id/profile` - обновить информацию профиля (для администраторов)
  - Для Telegram: `GET /api/inbox/telegram/users/:peerId` - получить информацию из Telegram API

- **Service методы:**
  - `InboxService.getConversationProfile(conversationId: string)`
  - `InboxService.updateConversationProfile(conversationId: string, profileData: any)`
  - `TelegramService.getUserProfile(peerId: string)` - для получения профиля из Telegram

#### Frontend задачи:
- При клике на аватар в header чата - открывать `ProfileModal`
- Отображать:
  - Аватар (большой)
  - Имя, username, телефон
  - Bio/описание
  - Статус онлайн
  - История переписки (статистика: количество сообщений, дата первого сообщения)
  - Действия: "Block user", "Report", "Clear chat history"
- Для Telegram: показывать дополнительную информацию (verified badge, etc.)

---

## Приоритеты реализации

### Высокий приоритет:
1. **Internal Notes** - критично для работы команды поддержки
2. **Mute Icon** - важная UX функция
3. **Last Message Preview** - улучшает навигацию

### Средний приоритет:
4. **Pinned Messages** - полезная функция для важных сообщений
5. **Profile View** - улучшает контекст общения
6. **Faster Media Loading** - оптимизация производительности

### Низкий приоритет:
7. **Online Status** - nice-to-have функция
8. **Stickers Support** - зависит от потребностей пользователей

---

## Технические детали

### Миграции базы данных
Все SQL миграции должны быть добавлены в `src/routes/init-db.controller.ts` в метод `migrateDatabase()`.

### API Версионирование
Все новые endpoints должны быть под префиксом `/api/inbox/` для консистентности.

### WebSocket события
Новые WebSocket события должны быть добавлены в `src/inbox/ws.gateway.ts`:
- `note.updated` - при обновлении заметки
- `message.pinned` - при закреплении сообщения
- `user.online` / `user.offline` - для статуса онлайн
- `conversation.muted` / `conversation.unmuted` - для мута чатов

### Frontend компоненты
Все новые компоненты должны быть в `frontend/src/components/`:
- `NotePanel.js` - для заметок
- `ProfileModal.js` - для профиля
- `StickerPicker.js` - для стикеров
- `MuteMenu.js` - меню для мута

### Тестирование
После реализации каждой функции необходимо протестировать:
- Работу API endpoints
- WebSocket события
- UI/UX взаимодействие
- Обработку ошибок
- Производительность

---

## Примечания

- Все изменения должны быть обратно совместимыми
- Проверить работу на мобильных устройствах (responsive design)
- Добавить обработку ошибок и loading states
- Использовать существующие паттерны кода из проекта

