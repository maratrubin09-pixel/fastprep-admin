# Статус тестирования PR1-PR9

## ❌ Что НЕ было сделано:

### 1. Unit-тесты
- ❌ Нет тестов для `NotesService`
- ❌ Нет тестов для `PresenceService`
- ❌ Нет тестов для `ConversationSettingsService`
- ❌ Нет тестов для методов `pinMessage`, `unpinMessage`, `toggleReaction` в `InboxService`
- ❌ Нет тестов для парсеров markdown

### 2. E2E тесты
- ❌ Нет e2e тестов для flow создания заметок
- ❌ Нет e2e тестов для flow закрепления сообщений
- ❌ Нет e2e тестов для flow отправки стикеров
- ❌ Нет e2e тестов для flow mute/unmute
- ❌ Нет e2e тестов для flow редактирования профиля

### 3. README для каждого PR
- ❌ Созданы только PR1 и PR2
- ❌ Нет README для PR3-PR9

## ✅ Что было сделано:

### 1. TypeScript строгие правила
- ✅ `tsconfig.json`: `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`
- ✅ Нет `@ts-ignore`, `@ts-nocheck` в коде
- ✅ Все ошибки TypeScript исправлены явными типами

### 2. WebSocket фильтрация
- ✅ `emitInboxEvent` фильтрует события по `canViewThread`
- ✅ `broadcastUserStatus` фильтрует по праву `inbox.view`
- ✅ События отправляются только пользователям с доступом

### 3. Даты ET с tooltip
- ✅ `formatTime` конвертирует в ET (Eastern Time)
- ✅ Добавлен `getTimeTooltip` для локального времени
- ✅ Tooltip компоненты добавлены для всех дат
- ✅ Все даты показывают "ET" суффикс при показе времени

### 4. README для PR1-PR2
- ✅ Созданы `PR1_NOTES_README.md` и `PR2_PINS_README.md`

## Требуется сделать:

1. Создать README для PR3-PR9
2. Написать unit-тесты для всех сервисов
3. Написать e2e тесты для ключевых потоков
4. Добавить скриншоты/GIF в README

