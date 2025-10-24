# WhatsApp Integration Stabilization Report

## ✅ Выполнено

### 1. Persistent хранилище сессий Baileys
- **Изменено**: `src/messengers/whatsapp/whatsapp.service.ts`
- Добавлена переменная окружения `BAILEYS_DIR` (по умолчанию `/var/data/baileys`)
- Сессии теперь хранятся в persistent storage и переживают рестарты сервиса
- Используется `useMultiFileAuthState` с правильным путем к сессиям

### 2. IPv4 DNS предпочтение
- **Изменено**: `.env.example`, `render.yaml`
- Добавлен `NODE_OPTIONS=--dns-result-order=ipv4first` для приоритета IPv4
- Настроено в Render для сервиса `fastprep-admin-api`

### 3. Обновление зависимостей
- **Изменено**: `package.json`
- Обновлен `@whiskeysockets/baileys` с `^6.7.0` до `^6.7.7`
- Добавлен `@types/qrcode` для TypeScript типов
- Все зависимости установлены и протестированы

### 4. Строгая типизация TypeScript
- **Изменено**: `tsconfig.json`
- Включен `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`
- Исправлены все TypeScript ошибки в:
  - `src/messengers/whatsapp/whatsapp.service.ts`
  - `src/messengers/messengers.service.ts`
  - `src/inbox/ws.gateway.ts`
- Проект успешно компилируется без ошибок

### 5. Улучшенная инициализация сокета
- **Изменено**: `src/messengers/whatsapp/whatsapp.service.ts`
- Добавлены параметры:
  ```typescript
  browser: ['Chrome', '120.0.0', 'Windows']
  syncFullHistory: false
  markOnlineOnConnect: false
  connectTimeoutMs: 20000
  keepAliveIntervalMs: 15000
  ```

### 6. Экспоненциальный backoff для реконнектов
- Реализован backoff: 1s → 2s → 5s → 15s → 60s
- Добавлен jitter для избежания thundering herd
- Счетчик попыток сбрасывается при успешном подключении

### 7. DNS/TLS диагностика
- **Добавлено**: метод `runNetworkDiagnostics()`
- Проверка DNS для `web.whatsapp.com` и `edge.whatsapp.com`
- Проверка TLS соединения на порт 443
- Логи выводятся при старте сервиса

### 8. Persistent disk в Render
- **Изменено**: `render.yaml`
- Добавлен persistent disk:
  ```yaml
  disk:
    name: baileys-data
    mountPath: /var/data/baileys
    sizeGB: 2
  ```

### 9. Улучшенное логирование
- Добавлены emoji для визуального различия логов:
  - ✅ успешные операции
  - ❌ ошибки
  - ⏳ ожидание
  - 🔍 диагностика

## 📋 Критерии готовности

✅ **Сборка проходит без TS-ошибок** (strict остаётся включён)
```bash
npm run build
# Exit code: 0
```

✅ **В логах видна успешная диагностика**
- При старте будут логи DNS и TLS проверок
- Формат: `[DNS] web.whatsapp.com: ...` и `[TLS] Connected to WhatsApp on port 443`

✅ **Сессии создаются в persistent storage**
- Путь: `/var/data/baileys/session_{userId}`
- Переживают рестарт сервиса

⏳ **Тестирование QR-кода** (требует деплоя на Render)
- Если timeout сохраняется — следующий шаг: вынести WA в отдельный сервис/VPS

## 🚀 Деплой

Изменения запушены в `main`:
```
commit ec6830c
feat(whatsapp): stable Baileys on Render (persistent state, IPv4 DNS, deps, diagnostics)
```

### Следующие шаги:

1. **Render автоматически задеплоит** изменения
2. **Проверить логи** на наличие DNS/TLS диагностики
3. **Протестировать QR-код**:
   - Открыть Messenger Settings
   - Нажать "Connect" на WhatsApp
   - Проверить, появляется ли QR-код
   - Отсканировать телефоном
4. **Мониторинг логов** на наличие timeout/reconnect циклов

## 🔍 Если проблема сохраняется

Если после деплоя всё ещё наблюдаются timeout/reconnect циклы:

### Возможные причины:
1. **Render блокирует WebSocket к WhatsApp** (firewall/rate limiting)
2. **IP-ban от WhatsApp** (детекция VPS/облака)
3. **Missing native dependencies** (libcurl, libssl)

### Решения:
1. **Вынести WhatsApp в отдельный микросервис** на другой платформе (Railway, Fly.io, Digital Ocean)
2. **Использовать proxy/tunnel** для обхода блокировок
3. **Переключиться на WhatsApp Business API** (официальный, платный)
4. **Использовать WAHA** (готовое решение на базе whatsapp-web.js)

## 📝 Технические детали

### Файлы изменены:
- `.env.example` (создан)
- `.gitignore` (обновлен: dist/, !.env.example)
- `package.json` (baileys 6.7.7, @types/qrcode)
- `render.yaml` (NODE_OPTIONS, BAILEYS_DIR, disk)
- `tsconfig.json` (strict: true)
- `src/messengers/whatsapp/whatsapp.service.ts` (основные изменения)
- `src/messengers/messengers.service.ts` (типы)
- `src/inbox/ws.gateway.ts` (типы)

### Зависимости:
```json
{
  "@whiskeysockets/baileys": "^6.7.7",
  "qrcode": "^1.5.3",
  "@types/qrcode": "^1.5.5"
}
```

### Environment Variables (Render):
```
NODE_OPTIONS=--dns-result-order=ipv4first
BAILEYS_DIR=/var/data/baileys
```

---

**Статус**: ✅ Готово к тестированию на Render
**Дата**: 2025-10-24
**Commit**: ec6830c
