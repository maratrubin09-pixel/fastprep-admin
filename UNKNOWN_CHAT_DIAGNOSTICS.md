# Диагностика проблемы "Unknown" чатов - Скриншоты для архитектора

## Проблема:
Новый чат не определяется - отображается как "Unknown" вместо имени пользователя/чата.

**Пример:**
- Telegram ID: `telegram:380966439`
- Отображается как: "Unknown"
- Ожидается: имя пользователя, username или телефон

---

## Скриншот 1: Render API Logs - Получение входящего сообщения

**Шаги:**
1. Откройте Render Dashboard → `fastprep-admin-api` → **Logs**
2. Найдите момент получения сообщения от нового чата (когда пришло "Тест")
3. Скопируйте или сделайте скриншот логов за период получения сообщения

**Что должно быть в логах:**
- `📥 Incoming message received from Telegram: chatId=...`
- `🔍 About to process incoming message...`
- Логи получения `chatTitle` и `senderName`:
  - `✅ Got sender info from message._sender: ...`
  - `✅ Got entity info: chatTitle=..., senderName=...`
  - `✅ Extracted sender info separately: ...`
  - `⚠️ Using fallback name: ...`
- `🔍 Finding or creating thread for chat: chatId=...`
- `📝 Thread found or created: id=..., chat_title=...`

**Если видно только `Unknown` в логах:**
- Проблема в получении entity из Telegram API
- Или `message._sender` не содержит информации

---

## Скриншот 2: Render API Logs - Вызов findOrCreateThread

**Шаги:**
1. В тех же логах Render API найдите вызов `findOrCreateThread`
2. Найдите логи обновления `chat_title`

**Что должно быть в логах:**
- `🔍 Finding or creating thread for chat: chatId=..., chat_title=..., ...`
- `Before update: chat_title="Unknown", ...`
- `Update values: chat_title=..., telegram_peer_id=...`
- `Conversation updated: chat_title="...", ...`

**Что искать:**
- Приходит ли `chat_title` отличный от "Unknown"?
- Вызывается ли обновление `chat_title`?
- Какие параметры передаются в `findOrCreateThread`?

---

## Скриншот 3: Render API Logs - Ошибки при получении entity

**Шаги:**
1. В тех же логах Render API найдите все ошибки/предупреждения
2. Особенно ищите строки с:
   - `Could not extract from message._sender`
   - `Could not fetch chat info for`
   - `Could not fetch sender info for`
   - `Failed to get entity`

**Что искать:**
- Есть ли ошибки при получении entity?
- Какие именно ошибки (таймаут, 401, 404)?
- На каком этапе падает (способ 1, 2, 3, 4)?

---

## Скриншот 4: Frontend Console - Получение нового сообщения через WebSocket

**Шаги:**
1. Откройте DevTools (F12) → вкладка **Console**
2. Дождитесь нового сообщения от Unknown чата
3. Сделайте скриншот всех логов после получения сообщения

**Что должно быть в логах:**
- `📨 New message received via WebSocket: Object`
- `✅ Adding message to UI: ...`
- Логи обновления списка чатов:
  - `🔄 Conversation not in list, fetching updated list...`
  - Или обновление существующего чата

**Что искать:**
- Как обрабатывается новое сообщение на frontend?
- Обновляется ли список чатов?
- Какие данные приходят в WebSocket событии?

---

## Скриншот 5: Frontend Console - Загрузка списка чатов

**Шаги:**
1. Откройте DevTools (F12) → вкладка **Console**
2. Перезагрузите страницу (F5)
3. Сделайте скриншот логов загрузки чатов

**Что должно быть в логах:**
- `📋 Fetching conversations...`
- `✅ Conversations loaded: X conversations`
- Логи каждого чата с его данными

**Что искать:**
- Какие данные приходят для Unknown чата?
- Есть ли `chat_title` в данных?
- Есть ли `sender_first_name`, `sender_last_name`, `sender_username`, `sender_phone`?

---

## Скриншот 6: Network Tab - GET /api/inbox/conversations

**Шаги:**
1. Откройте DevTools (F12) → вкладка **Network**
2. Включите фильтр "Fetch/XHR"
3. Перезагрузите страницу (F5)
4. Найдите GET запрос к `/api/inbox/conversations`
5. Кликните на запрос
6. Откройте вкладку **Response**
7. Сделайте скриншот

**Что должно быть в Response:**
```json
[
  {
    "id": "...",
    "chat_title": "Unknown",
    "chat_type": "telegram",
    "sender_first_name": null,
    "sender_last_name": null,
    "sender_username": null,
    "sender_phone": null,
    ...
  }
]
```

**Что искать:**
- Какие поля заполнены для Unknown чата?
- Есть ли `sender_first_name`, `sender_last_name`?
- Есть ли `sender_username`, `sender_phone`?
- Какой `external_chat_id`?

---

## Скриншот 7: Database Query - Проверка данных в БД

**Шаги:**
1. Подключитесь к базе данных (через Render Dashboard → Shell или через pgAdmin)
2. Выполните SQL запрос:
   ```sql
   SELECT 
     id,
     chat_title,
     chat_type,
     external_chat_id,
     sender_first_name,
     sender_last_name,
     sender_username,
     sender_phone,
     telegram_peer_id,
     created_at,
     updated_at
   FROM conversations
   WHERE chat_title = 'Unknown'
   ORDER BY created_at DESC
   LIMIT 5;
   ```
3. Сделайте скриншот результатов

**Что искать:**
- Что сохранено в БД для Unknown чата?
- Есть ли `sender_first_name`, `sender_last_name`?
- Есть ли `sender_username`, `sender_phone`?
- Есть ли `telegram_peer_id`?
- Когда был создан и обновлен?

---

## Скриншот 8: Database Query - Проверка последних сообщений

**Шаги:**
1. Выполните SQL запрос:
   ```sql
   SELECT 
     m.id,
     m.conversation_id,
     m.direction,
     m.text,
     m.created_at,
     c.chat_title,
     c.external_chat_id
   FROM messages m
   JOIN conversations c ON m.conversation_id = c.id
   WHERE c.chat_title = 'Unknown'
   ORDER BY m.created_at DESC
   LIMIT 5;
   ```
2. Сделайте скриншот результатов

**Что искать:**
- Какие сообщения связаны с Unknown чатом?
- Когда были созданы?
- Есть ли связь с правильным `conversation_id`?

---

## Скриншот 9: Render API Logs - Полный лог обработки одного сообщения

**Шаги:**
1. Откройте Render Dashboard → `fastprep-admin-api` → **Logs**
2. Найдите **полный цикл** обработки одного входящего сообщения от Unknown чата
3. Скопируйте весь лог от начала до конца (можно использовать поиск по `message.id`)

**Что должно быть:**
- Полный лог от получения сообщения до сохранения в БД
- Все этапы получения entity
- Все вызовы `findOrCreateThread`
- Все SQL запросы

**Важно:** Нужен полный лог для понимания последовательности операций.

---

## Скриншот 10: UI - Текущее состояние Unknown чата

**Шаги:**
1. Сделайте скриншот всего интерфейса с Unknown чатом (как в примере)
2. Убедитесь, что видны:
   - Список чатов (Unknown выделен)
   - Активный чат (Unknown с telegram ID)
   - Сообщения в чате

**Что искать:**
- Как отображается Unknown чат?
- Есть ли telegram ID?
- Какие сообщения видны?

---

## Приоритет скриншотов:

**Критично (нужны в первую очередь):**
1. **Скриншот 1** - Render API Logs при получении сообщения
2. **Скриншот 9** - Полный лог обработки одного сообщения
3. **Скриншот 7** - Database Query - что сохранено в БД

**Важно:**
4. Скриншот 2 - Вызов findOrCreateThread
5. Скриншот 3 - Ошибки при получении entity
6. Скриншот 6 - Network Response с данными чата

**Дополнительно:**
7. Скриншот 4 - Frontend Console
8. Скриншот 5 - Загрузка списка чатов
9. Скриншот 8 - Проверка сообщений
10. Скриншот 10 - UI состояние

---

## Что еще можно предоставить:

### 1. Логи Telegram Bot/Client
Если есть доступ к логам Telegram клиента (где обрабатываются входящие сообщения), нужны:
- Логи получения сообщения от Telegram API
- Что приходит в `message._sender`?
- Что возвращает `getEntity(chatId)`?
- Есть ли ошибки при вызове Telegram API?

### 2. Environment Variables
- Есть ли проблемы с доступом к Telegram API?
- Правильно ли настроен `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`?

### 3. Повторяемость проблемы
- Это происходит со всеми новыми чатами?
- Или только с определенными пользователями?
- Работает ли для чатов, которые были созданы раньше?

---

## Быстрая проверка:

**Минимальный набор для диагностики:**
1. Скриншот 1 - Render API Logs при получении сообщения
2. Скриншот 9 - Полный лог обработки (можно текстом)
3. Скриншот 7 - Database Query результаты

Этого должно быть достаточно, чтобы понять:
- Получается ли информация о чате из Telegram API?
- Сохраняется ли она в БД?
- Обновляется ли `chat_title`?

---

## Формат для отправки архитектору:

1. **Описание проблемы:**
   - Новый чат отображается как "Unknown"
   - Telegram ID: `telegram:380966439`
   - Ожидается: имя пользователя, username или телефон

2. **Скриншоты (приоритетные):**
   - Render API Logs при получении сообщения
   - Полный лог обработки одного сообщения
   - Database Query результаты

3. **Вопросы для архитектора:**
   - Почему `message._sender` не содержит информации?
   - Почему `getEntity(chatId)` не возвращает данные?
   - Как улучшить логику получения entity для новых чатов?
   - Нужна ли retry логика для получения entity?

