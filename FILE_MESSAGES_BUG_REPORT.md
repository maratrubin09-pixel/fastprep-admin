# Отчет о проблеме с файловыми сообщениями

## Дата: 1 ноября 2025

## Краткое резюме

**Проблема:** Файловые сообщения не отправляются через Telegram из FastPrep Admin.

**Основная причина (гипотеза):** Сообщения не создаются в таблице `outbox` или создаются с неправильным статусом, из-за чего worker не находит их для обработки.

**Критические находки:**
1. ✅ Файлы успешно загружаются в S3
2. ✅ `objectKey` генерируется и передается корректно
3. ❌ Worker показывает пустой outbox (`count: '0'`)
4. ❌ Сообщения не доходят до получателя
5. ⚠️ Возможна race condition с `resetKey` в frontend

**Требуется помощь архитектора для:**
- Проверки транзакций в `createOutgoingMessage()`
- Проверки настроек connection pool для worker и API
- Диагностики проблемы с isolation level транзакций

---

## Проблема

Файловые сообщения (изображения, видео, документы) не отправляются через Telegram из FastPrep Admin приложения. Конкретные симптомы:

1. **Исходящие файловые сообщения не отправляются**
   - Файл загружается в S3 успешно
   - `objectKey` генерируется корректно
   - Но сообщение не доходит до получателя
   - Файл остается в UI после попытки отправки

2. **Входящие файловые сообщения не открываются** (частично решено)
   - Некоторые изображения теперь загружаются успешно (судя по логам `Image loaded successfully`)
   - Но проблема может сохраняться для других типов файлов

3. **Worker не обрабатывает сообщения из outbox**
   - Логи показывают: `Pending outbox stats: { count: '0', ready_count: '0', future_count: '0' }`
   - Worker постоянно показывает пустой outbox, хотя сообщения должны там быть

## Архитектура

```
Frontend (React) 
  ↓ POST /api/inbox/conversations/:id/messages {text, objectKey}
Backend API (NestJS)
  ↓ createOutgoingMessage() → INSERT INTO messages + INSERT INTO outbox
PostgreSQL (messages, outbox tables)
  ↓ Worker читает из outbox
Worker Service (NestJS)
  ↓ sendViaTelegram() → telegramService.sendMessageWithFile()
Telegram Service
  ↓ Загрузка из S3 → sendFile()
Telegram
```

## Что было сделано

### 1. Добавлено детальное логирование на всех этапах:

**Frontend:**
- `📎 FileUpload callback: objectKey=...` - проверка передачи objectKey
- `📤 Sending message request: {...}` - проверка payload перед отправкой

**Backend API:**
- `📥 Presign request received:` - получение запроса на presign
- `📤 Creating outgoing message:` - создание исходящего сообщения
- `🔍 About to insert message:` - перед вставкой в БД
- `✅ Message created:` - после создания сообщения
- `✅ Outbox entry created:` - после создания записи в outbox

**Worker:**
- `📊 Pending outbox stats:` - статистика outbox
- `📨 Processing message:` - обработка сообщения
- `📤 Calling sendViaTelegram:` - вызов Telegram сервиса

### 2. Улучшена валидация:
- Добавлена проверка формата `objectKey` на frontend
- Улучшена обработка ошибок в MediaPreview

### 3. Исправлены другие проблемы:
- Автопрокрутка до новых сообщений
- Сортировка чатов по дате последнего сообщения
- Сброс файла из UI после отправки (через resetKey)

## Результаты диагностики по логам

### ✅ Что работает:

1. **Загрузка файла в S3:**
   ```
   ✅ Got presigned URL, objectKey: inbox/2da76805-..._Screenshot.png
   ✅ File uploaded to S3 successfully
   ```

2. **Генерация presigned URL (API логи):**
   ```
   📥 Presign request received: threadId: '2da76805-...', filename: 'Screenshot 2025-10-27 at 8.38.04 AM.png'
   ✅ Presigned URL generated: inbox/2da76805-a794-473e-abb8-e44e98bfd13e/75a033d9-..._Screenshot.png
   ```

3. **Передача objectKey из FileUpload:**
   ```
   FileUpload callback: objectKey= inbox/2da76805-..._Screenshot.png
   ```

4. **Входящие изображения:**
   ```
   ✅ Image loaded successfully: inbox/2da76805-..._Screenshot.png
   ```

### ❌ КРИТИЧЕСКАЯ ПРОБЛЕМА: Сообщения не создаются в outbox

**Анализ логов Render API:**
После успешной генерации presigned URL в логах **НЕТ** следующих записей:
- ❌ НЕТ `📤 Creating outgoing message:`
- ❌ НЕТ `📤 Full DTO received:`
- ❌ НЕТ `🔍 About to insert message:`
- ❌ НЕТ `✅ Message created:`
- ❌ НЕТ `✅ Outbox entry created:`
- ❌ НЕТ `✅ Transaction committed successfully`

**Вывод:** POST запрос к `/api/inbox/conversations/:id/messages` **НЕ ДОХОДИТ** до backend или падает на валидации до логирования.

**Анализ логов Worker:**
```
Pending outbox stats: { count: '0', ready_count: '0', future_count: '0' }
leaseBatch() returned 0 rows
```
Повторяется постоянно - outbox полностью пустой.

**Вывод:** Сообщения действительно не создаются в outbox, потому что запрос на создание сообщения не доходит до `createOutgoingMessage()`.

### ⚠️ Дополнительные проблемы:

1. **FileUpload callback получает null:**
   ```
   FileUpload callback: objectKey= null  (множество раз)
   ```
   **Проблема:** `resetKey` может срабатывать до завершения отправки, или callback вызывается с null параметром при сбросе компонента.

2. **Длинные URL растягивают чат:**
   В UI видно, что длинные URL не переносятся на новую строку, растягивая чат горизонтально.

## Гипотезы о причине проблемы

### Гипотеза 1: Сообщения не создаются в outbox
**Причина:** Возможно, `createOutgoingMessage()` не выполняется или транзакция откатывается.

**Проверка:** В логах Render API должны быть строки:
- `📤 Creating outgoing message:`
- `🔍 About to insert message:`
- `✅ Message created:`
- `✅ Outbox entry created:`

**Если этих логов нет после отправки файла** → сообщение не доходит до backend или валидация падает.

### Гипотеза 2: Сообщения создаются, но с неправильным статусом/датой
**Причина:** Возможно, в outbox создается запись со статусом не `'pending'` или `scheduled_at` в будущем.

**Проверка SQL:**
```sql
SELECT id, message_id, status, scheduled_at, attempts, created_at 
FROM outbox 
WHERE status = 'pending' 
ORDER BY created_at DESC 
LIMIT 10;
```

**Если записей нет или статус не 'pending'** → проблема в `createOutgoingMessage()`.

### Гипотеза 3: Worker читает из неправильной таблицы или БД
**Причина:** Возможно, worker подключен к другой БД или использует другой connection pool.

**Проверка:** Убедиться, что worker и API используют одни и те же переменные окружения для подключения к БД.

### Гипотеза 4: objectKey теряется при отправке
**Причина:** Возможно, `attachedFileKey` сбрасывается в `null` до отправки сообщения.

**Проверка:** В консоли браузера должны быть логи:
- `📤 Sending message request: {..., attachedFileKey: 'inbox/...'}`

**Если `attachedFileKey: '(none)'`** → файл не сохраняется в state перед отправкой.

## Детальный анализ логов (на основе предоставленных скриншотов)

### Логи Render API (fastprep-admin-api):

**Что ЕСТЬ в логах:**
```
📥 Presign request received: threadId: '2da76805-...', filename: 'Screenshot...', contentType: 'image/png'
✅ Presigned URL generated: inbox/2da76805-..._Screenshot.png
```

**Чего НЕТ в логах (критично!):**
- ❌ POST запрос к `/api/inbox/conversations/:id/messages` не логируется
- ❌ Нет строк `📤 Creating outgoing message:`
- ❌ Нет строк `✅ Message created:`
- ❌ Нет строк `✅ Outbox entry created:`

**Вывод:** POST запрос с `objectKey` либо:
1. Не отправляется с frontend
2. Блокируется валидацией до логирования
3. Падает с ошибкой до логирования
4. Идет на другой endpoint

### Логи Render Worker (fastprep-admin-worker):

**Что ЕСТЬ в логах:**
```
Pending outbox stats: { count: '0', ready_count: '0', future_count: '0' }
leaseBatch() returned 0 rows
```
Повторяется каждую секунду - outbox постоянно пустой.

**Вывод:** Worker работает, но не находит сообщений для обработки, потому что они не создаются.

### Логи браузера (Console):

**Что ЕСТЬ:**
```
📎 FileUpload callback: objectKey= inbox/2da76805-..._Screenshot.png  (успешно)
📎 FileUpload callback: objectKey= null  (множество раз - проблема!)
✅ File uploaded to S3 successfully
✅ Image loaded successfully: inbox/... (для входящих)
```

**Чего НЕТ (нужно проверить):**
- ❌ Нет логов `📤 Sending message request: {...}` после успешной загрузки файла
- ❌ Нет логов о POST запросе к `/api/inbox/conversations/:id/messages`

**Вывод:** После успешной загрузки файла в S3 сообщение **НЕ ОТПРАВЛЯЕТСЯ** на backend.

## Что нужно проверить архитектору

### 1. Проверить Network tab в браузере при отправке файла:

После загрузки файла в S3 и нажатия "Send" должен появиться POST запрос к:
```
POST https://fastprep-admin-api.onrender.com/api/inbox/conversations/:id/messages
```

**В Payload должно быть:**
```json
{
  "text": "...",
  "objectKey": "inbox/2da76805-..._Screenshot.png"
}
```

**Проверить:**
- Отправляется ли этот запрос?
- Какой статус ответа (200, 201, 400, 500)?
- Что в Response body?

### 2. Проверить логи Render API при отправке файла:

После отправки файлового сообщения должны появиться логи:
```
📤 Creating outgoing message: threadId=..., hasObjectKey=true, objectKey=inbox/...
📤 Full DTO received: {"text":"","objectKey":"inbox/...","textLength":0}
🔍 About to insert message: threadId=..., objectKey=inbox/...
✅ Message created: id=..., hasObjectKey=true, objectKey=inbox/...
✅ Outbox entry created: message_id=..., conversation_id=...
✅ Transaction committed successfully for message ...
```

**Если этих логов нет:**
- Проверить, доходит ли POST запрос до `/api/inbox/conversations/:id/messages`
- Проверить, проходит ли валидация `objectKey` (префикс `inbox/${threadId}/`)
- Проверить, есть ли ошибки в логах API

### 3. Проверить, почему POST запрос не доходит до backend:

**Возможные причины:**
1. Frontend не отправляет запрос (проверка `if ((!text.trim() && !attachedFileKey) || !selectedThread) return;` срабатывает)
2. Валидация `objectKey` падает до логирования
3. Ошибка CORS или network error
4. `attachedFileKey` становится `null` до отправки из-за `resetKey`

**Проверить в Console:**
После нажатия "Send" должны появиться логи:
```
📤 Sending message request: {threadId: '...', attachedFileKey: 'inbox/...', ...}
```

Если этого лога нет → `sendMessage()` не вызывается или возвращается раньше.

### 4. Проверить БД напрямую:

```sql
-- Проверить последние сообщения
SELECT id, conversation_id, direction, text, object_key, delivery_status, created_at 
FROM messages 
WHERE direction = 'out' 
ORDER BY created_at DESC 
LIMIT 5;

-- Проверить последние записи в outbox
SELECT id, message_id, conversation_id, status, scheduled_at, attempts, created_at 
FROM outbox 
ORDER BY created_at DESC 
LIMIT 5;

-- Проверить связь messages и outbox
SELECT 
  m.id as message_id,
  m.object_key,
  m.delivery_status,
  o.id as outbox_id,
  o.status as outbox_status,
  o.scheduled_at
FROM messages m
LEFT JOIN outbox o ON o.message_id = m.id
WHERE m.direction = 'out'
ORDER BY m.created_at DESC
LIMIT 10;
```

### 5. Проверить переменные окружения Worker:

Убедиться, что worker использует правильные:
- `DATABASE_URL` - та же БД, что и API
- Другие необходимые переменные

### 6. Проверить Network tab в браузере (уже описано выше):

После отправки файла найти POST запрос к `/api/inbox/conversations/:id/messages` и проверить:
- **Payload:** должен содержать `{"text":"...","objectKey":"inbox/..."}`
- **Response:** должен быть 201 с данными сообщения, включая `object_key`

### 7. Проверить Console логи (уже описано выше):

После отправки файла должны быть:
```
📎 FileUpload callback: objectKey= inbox/...
📤 Sending message request: {threadId: '...', attachedFileKey: 'inbox/...', ...}
```

**Если `attachedFileKey: '(none)'`** → проблема в frontend state management.

## Рекомендации для исправления

### 1. Если сообщения не создаются в outbox:

Добавить более детальную обработку ошибок в `createOutgoingMessage()`:
- Логировать каждый шаг транзакции
- Логировать ошибки перед rollback
- Возвращать более детальные ошибки клиенту

### 2. Если worker не видит сообщения:

Проверить:
- Использует ли worker правильную БД
- Правильно ли настроен connection pool
- Нет ли проблем с транзакциями (isolation level)

### 3. Если objectKey теряется:

Улучшить state management в frontend:
- Не сбрасывать `attachedFileKey` до подтверждения отправки
- Использовать `useRef` для сохранения значения между рендерами

## Файлы, которые нужно проверить

1. `src/inbox/inbox.service.ts` - метод `createOutgoingMessage()`
2. `src/inbox/messages.controller.ts` - endpoint `POST /api/inbox/conversations/:id/messages`
3. `src/worker/worker.service.ts` - метод `leaseBatch()` и `processOne()`
4. `frontend/src/pages/InboxPage.js` - логика отправки сообщений
5. `frontend/src/components/FileUpload.js` - логика загрузки файлов

## Дополнительная информация

- **S3 Storage:** DigitalOcean Spaces (`fastprepusaattachments.nyc3.digitaloceanspaces.com`)
- **Backend API:** `fastprep-admin-api.onrender.com`
- **Worker:** `fastprep-admin-worker` на Render
- **Database:** PostgreSQL на Render

## Критическая находка: resetKey может сбрасывать objectKey до отправки

В `FileUpload.js` есть `useEffect`, который вызывает `onFileUploaded(null)` при изменении `resetKey`:

```javascript
useEffect(() => {
  if (resetKey !== null) {
    setUploadedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onFileUploaded?.(null);  // ⚠️ Это сбрасывает attachedFileKey в null!
  }
}, [resetKey, onFileUploaded]);
```

Если `resetKey` изменяется **до** того, как `sendMessage()` читает `attachedFileKey`, сообщение может отправиться без `objectKey`.

**Решение:** Убедиться, что `setFileUploadResetKey()` вызывается **ТОЛЬКО ПОСЛЕ** успешной отправки (когда ответ от сервера получен).

В коде сейчас:
```javascript
setAttachedFileKey(null);
setFileUploadResetKey(prev => prev + 1); // Сбрасываем FileUpload компонент
```
Это вызывается сразу после получения ответа от сервера, что правильно. Но если есть race condition или состояние обновляется асинхронно, может быть проблема.

## Вопросы для архитектора

1. Правильно ли настроена транзакция в `createOutgoingMessage()`?
2. Может ли быть проблема с isolation level транзакций, из-за которой worker не видит записи?
3. Нужно ли добавить retry механизм для создания outbox записей?
4. Правильно ли настроен connection pool для worker и API (они должны видеть одни и те же данные)?
5. Может ли быть race condition между изменением `resetKey` и чтением `attachedFileKey` в `sendMessage()`?

---

**Статус:** Требуется помощь архитектора для диагностики проблемы с outbox и проверки возможных race conditions.


