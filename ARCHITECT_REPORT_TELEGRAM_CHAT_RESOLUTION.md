# Отчет для архитектора: Проблема определения чатов Telegram и сохранения telegramPeerId

**Дата:** 1 ноября 2025  
**Проблема:** Новые чаты Telegram определяются как "Unknown" или "Chat [ID]", и не сохраняется `telegramPeerId`, что приводит к невозможности отправки сообщений.

---

## 1. Архитектура обработки входящих сообщений

### 1.1. Точка входа: `telegram.service.ts` → `processIncomingMessage()`

**Файл:** `fastprep-admin/src/messengers/telegram/telegram.service.ts`  
**Строки:** ~220-595

Функция обрабатывает входящие сообщения от Telegram API и извлекает информацию о чате и отправителе.

### 1.2. Методы получения информации о чате (в порядке приоритета)

#### **Method 1: Из `message._sender`** (строки 274-299)
```typescript
const sender = message._sender;
if (sender) {
  senderFirstName = sender.firstName || null;
  senderLastName = sender.lastName || null;
  senderUsername = sender.username || null;
  senderPhone = sender.phone || null;
  // ...
}
```
**Проблема:** Для новых чатов `message._sender` часто `null` или `undefined`.

#### **Method 2a: Из `message._entities`** (строки 301-328)
```typescript
if (message._entities) {
  for (const entity of message._entities || []) {
    if (entity.className === 'User' && entity.id) {
      // Извлекаем данные пользователя
    }
  }
}
```
**Проблема:** `message._entities` не всегда доступен в новом формате событий.

#### **Method 2b: Через `getEntity(chatId)`** (строки 330-422)
```typescript
// Попытка 1: Создать InputPeerUser из message.peerId (строки 338-348)
if (message.peerId && message.peerId.userId) {
  entity = new Api.InputPeerUser({
    userId: bigInt(message.peerId.userId),
    accessHash: bigInt(message.peerId.accessHash || '0'),
  });
}

// Попытка 2: Стандартный getEntity (строки 352-355)
if (!entity) {
  entity = await this.client.getEntity(chatId);
}
```
**Критическая проблема:** Для новых чатов `getEntity()` падает с ошибкой:
```
Could not find the input entity for {"userId": "49003045", "className": "PeerUser"}
```
Это происходит потому, что для новых чатов нет `accessHash` в кэше Telegram клиента.

#### **Method 2c: Через `getDialogs()`** (строки 358-375) ✅ **РАБОТАЕТ**
```typescript
try {
  const dialogs = await this.client.getDialogs({ limit: 200 });
  const foundDialog = dialogs.find((d: any) => {
    const dId = d.entity?.id?.toString() || d.id?.toString();
    return dId === String(chatId);
  });
  if (foundDialog && foundDialog.entity) {
    entity = foundDialog.entity;
    // Извлекаем данные из entity
  }
} catch (dialogsError: any) {
  // Логируем ошибку
}
```
**Статус:** Метод добавлен в последнем деплое, но есть проблема - entity из `getDialogs()` не используется для сохранения `telegramPeerId` (см. раздел 2.3).

#### **Method 3: Получение sender отдельно** (строки 424-464)
```typescript
if (senderId && (senderName === 'Unknown' || chatTitle === 'Unknown')) {
  const sender = await this.client.getEntity(senderId);
  // Извлекаем данные отправителя
}
```
**Проблема:** Тот же `getEntity()` - не работает для новых пользователей.

#### **Method 4: Fallback** (строки 466-479)
```typescript
if (chatTitle === 'Unknown' && senderName === 'Unknown') {
  chatTitle = `Chat ${chatId}`;
  senderName = `Chat ${chatId}`;
}
```
**Результат:** Если ничего не сработало, используется "Chat [ID]".

---

## 2. Проблема сохранения `telegramPeerId`

### 2.1. Логика сохранения (строки 490-572)

`telegramPeerId` необходимо для отправки сообщений. Сохраняется в два этапа:

#### **Этап 1: Извлечение InputPeer из входящего сообщения**

**Способ 1: Из `message._sender`** (строки 495-516)
```typescript
const sender = message._sender;
if (sender && sender.id && sender.accessHash) {
  const serialized: any = {
    _: 'InputPeerUser',
    userId: String(sender.id),
    accessHash: String(sender.accessHash)
  };
  peerIdData = JSON.stringify(serialized);
}
```
**Проблема:** `message._sender.accessHash` часто отсутствует для новых чатов.

**Способ 2: Через `getEntity(chatId)`** (строки 518-565)
```typescript
const entity = await this.client.getEntity(chatId);
if ((entity as any).className === 'User') {
  const userId = (entity as any).id;
  const accessHash = (entity as any).accessHash;
  if (userId && accessHash) {
    // Создаем InputPeerUser
  }
}
```
**Критическая проблема:** Для новых чатов `getEntity()` падает (см. раздел 1.2).

#### **Этап 2: Проверка и логирование** (строки 567-572)
```typescript
if (!peerIdData) {
  this.logger.error(`❌ Could not save InputPeer for chat ${chatId} - messages to this chat will fail!`);
}
```

### 2.2. **ГЛАВНАЯ ПРОБЛЕМА: Method 2c не используется для сохранения telegramPeerId**

Когда Method 2c (`getDialogs`) успешно находит entity (строки 366-375), эта информация используется только для получения имени чата (`firstName`, `lastName`, `username`), но **НЕ используется для создания и сохранения `telegramPeerId`**.

**Текущая логика:**
1. Method 2c находит entity через `getDialogs()` ✅
2. Из entity извлекаются данные пользователя ✅
3. Но `peerIdData` остается `null` ❌
4. В базе данных сохраняется `telegramPeerId = null` ❌

**Что нужно исправить:**
В блоке Method 2c (после строки 375) нужно добавить логику создания `InputPeerUser` из найденного entity, аналогично тому, как это сделано в `resolveEntity` (строки 687-704).

### 2.3. Сохранение в базу данных

**Файл:** `fastprep-admin/src/inbox/inbox.service.ts`  
**Функция:** `findOrCreateThread()` (строки 141-320)

`telegramPeerId` передается в `findOrCreateThread` через параметр `telegram_peer_id` (строка 148).

**Обновление существующего треда:**
```typescript
if (params.telegram_peer_id !== undefined) {
  if (params.telegram_peer_id !== null) {
    updates.push(`telegram_peer_id = $${paramIndex++}`);
    values.push(params.telegram_peer_id);
  }
}
```
**Логика:** Обновляется только если значение не `null` (строки 250-257).

**Создание нового треда:**
```typescript
INSERT INTO conversations (..., telegram_peer_id, ...)
VALUES (..., $6, ...)
```
Где `$6 = params.telegram_peer_id || null` (строка 315).

**Проблема:** Если `peerIdData = null` (что происходит при ошибке извлечения), в БД сохраняется `NULL`, и отправка сообщений становится невозможной.

---

## 3. Проблема отправки сообщений

### 3.1. Функция `resolveEntity()` - определение entity для отправки

**Файл:** `fastprep-admin/src/messengers/telegram/telegram.service.ts`  
**Строки:** 627-720

**Логика:**
1. **Если есть сохраненный `telegramPeerId`** (строки 635-664):
   - Восстанавливается `InputPeerUser`/`InputPeerChat`/`InputPeerChannel` из JSON
   - ✅ Работает, если `telegramPeerId` был сохранен

2. **Fallback: `getEntity(chatId)`** (строки 667-675):
   - ❌ Не работает для новых чатов (та же проблема)

3. **Method 2c: Через `getDialogs()`** (строки 676-713) ✅ **ДОБАВЛЕН В ПОСЛЕДНЕМ ДЕПЛОЕ**
   - Если `getEntity()` не сработал, ищет чат в списке диалогов
   - Создает `InputPeer` из найденного entity
   - ✅ Работает как временное решение

**Проблема:** Если в БД нет `telegramPeerId`, система каждый раз пытается найти чат через `getDialogs()`, что:
- Медленнее, чем использование сохраненного `telegramPeerId`
- Может не сработать, если чат не найден в первых 200 диалогах
- Не сохраняет `telegramPeerId` для будущих отправок

---

## 4. Анализ логов

### 4.1. Пример из логов (chatId: 49003045)

```
DEBUG: Method 2b - Calling getEntity for chatId: 49003045
DEBUG: Method 2b - Created InputPeerUser from peerId
DEBUG: Method 2b - Processing entity, className: InputPeerUser
DEBUG: Method 2b - Entity data: title=null, firstName=null, lastName=null, username=null, phone=null
```

**Анализ:**
- `InputPeerUser` создан из `message.peerId` ✅
- Но entity не содержит данных пользователя (все поля `null`) ❌
- Это означает, что `message.peerId` есть, но в нем нет полной информации

```
LOG: Got entity info: chatTitle=Unknown, senderName=Unknown
LOG: ▲ Using fallback name: Chat 49003045
```

**Результат:** Используется fallback "Chat 49003045"

```
WARN: Could not get entity via getEntity for 49003045: 
  Error: Could not find the input entity for {"userId": "49003045", "className": "PeerUser"}
```

**Проблема:** `getEntity()` не работает для нового чата

```
ERROR: Could not save InputPeer for chat 49003045 - messages to this chat will fail!
ERROR: Details: senderName=Chat 49003045, chatTitle=Chat 49003045, hasMessageSender=false
```

**Критическая ошибка:** `telegramPeerId` не сохранен, отправка сообщений невозможна.

---

## 5. Корневые причины проблем

### 5.1. Архитектурная проблема: отсутствие `accessHash` для новых чатов

Telegram API требует `accessHash` для работы с entity пользователей через `getEntity()`. Для новых чатов `accessHash` отсутствует в кэше клиента, что приводит к ошибке:
```
Could not find the input entity for {"userId": "...", "className": "PeerUser"}
```

### 5.2. Неполная реализация Method 2c в `processIncomingMessage`

Method 2c (`getDialogs()`) успешно находит entity для новых чатов, но:
- ❌ Не используется для создания `telegramPeerId`
- ✅ Используется только для получения имени чата

**Решение:** Нужно добавить в блок Method 2c (после строки 375) логику создания `InputPeerUser` из найденного entity.

### 5.3. Дублирование логики между `processIncomingMessage` и `resolveEntity`

В `resolveEntity` уже реализован Method 2c с созданием `InputPeer` (строки 687-704), но эта логика отсутствует в `processIncomingMessage`.

---

## 6. Рекомендации по исправлению

### 6.1. Краткосрочное решение (быстрое исправление)

**Добавить создание `telegramPeerId` в Method 2c (`processIncomingMessage`)**

**Место:** После строки 375 в `telegram.service.ts`

**Код:**
```typescript
if (foundDialog && foundDialog.entity) {
  entity = foundDialog.entity;
  this.logger.log(`✅ Method 2c - Found in dialogs: className=${(entity as any).className || 'unknown'}`);
  
  // ИЗВЛЕЧЕНИЕ ДАННЫХ (уже есть, строки 380-386)
  // ...
  
  // ДОБАВИТЬ: СОЗДАНИЕ telegramPeerId из найденного entity
  if (!peerIdData) {  // peerIdData объявлен на строке 493
    if ((entity as any).className === 'User') {
      const userId = (entity as any).id;
      const accessHash = (entity as any).accessHash || '0';  // Может быть 0 для новых чатов
      if (userId) {
        const serialized: any = {
          _: 'InputPeerUser',
          userId: String(userId),
          accessHash: String(accessHash)
        };
        peerIdData = JSON.stringify(serialized);
        this.logger.log(`✅ Method 2c - Created telegramPeerId from dialog entity: ${peerIdData}`);
      }
    } else if ((entity as any).className === 'Chat') {
      const chatId_ = (entity as any).id;
      const serialized: any = {
        _: 'InputPeerChat',
        chatId: String(chatId_)
      };
      peerIdData = JSON.stringify(serialized);
      this.logger.log(`✅ Method 2c - Created telegramPeerId from dialog entity: ${peerIdData}`);
    } else if ((entity as any).className === 'Channel') {
      const channelId = (entity as any).id;
      const accessHash = (entity as any).accessHash || '0';
      if (channelId) {
        const serialized: any = {
          _: 'InputPeerChannel',
          channelId: String(channelId),
          accessHash: String(accessHash)
        };
        peerIdData = JSON.stringify(serialized);
        this.logger.log(`✅ Method 2c - Created telegramPeerId from dialog entity: ${peerIdData}`);
      }
    }
  }
}
```

### 6.2. Долгосрочное решение (рефакторинг)

**Вынести общую логику создания `InputPeer` в отдельную функцию:**

```typescript
private createInputPeerFromEntity(entity: any): string | null {
  if ((entity as any).className === 'User') {
    const userId = (entity as any).id;
    const accessHash = (entity as any).accessHash || '0';
    if (userId) {
      return JSON.stringify({
        _: 'InputPeerUser',
        userId: String(userId),
        accessHash: String(accessHash)
      });
    }
  }
  // ... для Chat и Channel аналогично
  return null;
}
```

Использовать эту функцию в:
- `processIncomingMessage` (Method 2c и после `getEntity()`)
- `resolveEntity` (Method 2c)

### 6.3. Дополнительные улучшения

1. **Увеличить лимит `getDialogs()`** с 200 до 500, если нужно (строка 361, 677)
2. **Кэшировать результаты `getDialogs()`** в Redis на 5-10 минут, чтобы не вызывать каждый раз
3. **Добавить retry механизм** с экспоненциальной задержкой, если `getDialogs()` не нашел чат с первого раза

---

## 7. Структура файлов и ключевые функции

### 7.1. `telegram.service.ts`

- **`processIncomingMessage()`** (строки ~220-595):
  - Извлечение информации о чате (Method 1-4)
  - Создание `telegramPeerId` (строки 490-572)
  - Отправка payload в backend API

- **`resolveEntity()`** (строки 627-720):
  - Восстановление или поиск entity для отправки сообщений
  - ✅ Method 2c уже реализован

### 7.2. `inbox.service.ts`

- **`findOrCreateThread()`** (строки 141-320):
  - Поиск существующего или создание нового треда
  - Сохранение `telegram_peer_id` в БД (строки 250-257, 315)

### 7.3. `telegram-events.controller.ts`

- **Обработка событий** от Telegram адаптера
- Вызов `findOrCreateThread()` с `telegramPeerId` (строка 86)

---

## 8. Зависимости и используемые библиотеки

- **Telegram API:** `telegram` (MTProto клиент)
- **Типы:** `Api` из `telegram/tl` для InputPeer*
- **Большие числа:** `big-integer` для работы с ID Telegram
- **База данных:** PostgreSQL через `pg` Pool
- **Кэш:** Redis через `ioredis`

---

## 9. Выводы

1. **Проблема:** `telegramPeerId` не сохраняется для новых чатов, потому что:
   - `getEntity()` не работает без `accessHash`
   - Method 2c (`getDialogs()`) не используется для создания `telegramPeerId` в `processIncomingMessage`

2. **Решение:** Добавить создание `telegramPeerId` в блок Method 2c после успешного поиска entity через `getDialogs()`

3. **Результат:** После исправления новые чаты смогут:
   - Правильно определяться (уже частично работает через Method 2c)
   - Сохранять `telegramPeerId` в БД
   - Отправлять сообщения без ошибок

---

**Готовность к исправлению:** ✅ Код готов, требуется только добавить создание `telegramPeerId` в Method 2c (`processIncomingMessage`).

