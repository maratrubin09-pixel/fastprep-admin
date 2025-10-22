# 🚀 FastPrep Admin: Deployment Guide (Render)

## Шаг 1: Подготовка GitHub (✅ DONE)
- Репозиторий: https://github.com/maratrubin09-pixel/fastprep-admin
- Код запушен в `main` branch

## Шаг 2: Создание Blueprint на Render

### 2.1 Войти в Render Dashboard
1. Открыть https://dashboard.render.com/
2. Войти через GitHub или email

### 2.2 Создать Blueprint
1. Нажать **"New"** → **"Blueprint"**
2. **Connect repository:** выбрать `maratrubin09-pixel/fastprep-admin`
3. Render автоматически найдёт `render.yaml` в корне
4. Нажать **"Apply"**

### 2.3 Что создастся автоматически:
- ✅ `fastprep-postgres` (PostgreSQL Starter, ~$7/мес)
- ✅ `fastprep-redis` (Redis Starter, ~$7/мес)
- ✅ `fastprep-admin-api` (Web Service, Starter ~$7/мес)
- ✅ `fastprep-admin-worker` (Worker, Starter ~$7/мес)
- ✅ `fastprep-tg-adapter` (Web Service + 1GB disk, Starter ~$7/мес)
- ⚠️ `fastprep-admin-frontend` (Static Site, Free) — **НЕ СОЗДАСТСЯ**, т.к. нет папки `frontend/`

**Итого стоимость:** ~$35/мес (без frontend)

## Шаг 3: Настройка Environment Variables

После создания Blueprint, нужно установить **секретные** env vars (отмечены `sync: false` в render.yaml):

### 3.1 S3/R2 (Cloudflare R2 или AWS S3)
Зайти в **fastprep-admin-api** → Environment:
```
S3_ENDPOINT=https://ваш-аккаунт-id.r2.cloudflarestorage.com
S3_BUCKET=fastprep-attachments
S3_ACCESS_KEY_ID=ваш_access_key
S3_SECRET_ACCESS_KEY=ваш_secret_key
```

**Как получить R2 credentials:**
1. Cloudflare Dashboard → R2 → Create Bucket → `fastprep-attachments`
2. R2 → Manage R2 API Tokens → Create API Token
3. Скопировать Access Key ID + Secret Access Key + Endpoint URL

### 3.2 TG Adapter (Telegram)
Зайти в **fastprep-tg-adapter** → Environment:
```
TG_API_ID=ваш_api_id
TG_API_HASH=ваш_api_hash
TDLIB_ENCRYPTION_KEY=любая_случайная_строка_32+_символов
```

**Как получить TG credentials:**
1. https://my.telegram.org/auth → войти
2. API development tools → Create application
3. Скопировать `api_id` и `api_hash`

### 3.3 TG Adapter Token (для связи API ↔ Adapter)
Зайти в **fastprep-admin-api** → Environment:
```
TG_ADAPTER_TOKEN=случайная_строка_64+_символов
```

Зайти в **fastprep-admin-worker** → Environment:
```
TG_ADAPTER_TOKEN=та_же_строка
```

**Генерация токена:** `openssl rand -hex 32`

### 3.4 Slack Webhook (опционально)
Зайти в **fastprep-admin-worker** → Environment:
```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Как получить:**
1. Slack App → Incoming Webhooks → Add New Webhook to Workspace
2. Выбрать канал `#fastprep-alerts`
3. Скопировать Webhook URL

### 3.5 Проверка автогенерируемых env vars
Render автоматически создаст:
- `JWT_SECRET` (generateValue: true)
- `CSRF_SECRET` (generateValue: true)
- `SERVICE_JWT` (generateValue: true для tg-adapter)
- `DATABASE_URL` (из fastprep-postgres)
- `REDIS_URL` (из fastprep-redis)

## Шаг 4: Запуск миграции БД

### 4.1 Получить Database URL
1. Render Dashboard → **fastprep-postgres**
2. Вкладка **"Info"** → копировать **"External Database URL"**

### 4.2 Запустить миграцию локально
```bash
cd /Users/maratrubin/fastprep-admin
psql "postgresql://user:pass@host:5432/dbname" < migrations/001_initial_schema.sql
```

**ИЛИ** через Render Shell:
1. Render Dashboard → **fastprep-admin-api** → **"Shell"**
2. Внутри шелла:
```bash
cat > /tmp/migration.sql << 'EOF'
# Вставить содержимое migrations/001_initial_schema.sql
EOF

psql $DATABASE_URL < /tmp/migration.sql
```

### 4.3 Проверка
```bash
psql $DATABASE_URL -c "SELECT * FROM roles;"
```
Должны вернуться 3 роли: Admin, Manager, Agent

## Шаг 5: Проверка работы API

### 5.1 Health Check
```bash
curl https://fastprep-admin-api.onrender.com/api/health
# Ожидается: {"ok":true,"timestamp":"..."}
```

### 5.2 API Info
```bash
curl https://fastprep-admin-api.onrender.com/api
# Ожидается: {"name":"FastPrep Admin API","version":"0.1.0",...}
```

### 5.3 Логи
Render Dashboard → **fastprep-admin-api** → **"Logs"**
- Должно быть: `API listening on :10000` (Render использует порт 10000 по умолчанию)

## Шаг 6: Проверка Worker

### 6.1 Логи Worker
Render Dashboard → **fastprep-admin-worker** → **"Logs"**
- Должно быть:
  - `Outbox Worker starting...`
  - `Metrics server listening on :9090`

### 6.2 Метрики (если worker имеет публичный URL)
```bash
curl https://fastprep-admin-worker.onrender.com/metrics
# Должны вернуться Prometheus-метрики
```

⚠️ **Примечание:** Worker-сервисы на Render обычно не имеют публичного URL, метрики доступны только внутри сети Render.

## Шаг 7: Проверка TG Adapter

### 7.1 Логи
Render Dashboard → **fastprep-tg-adapter** → **"Logs"**

⚠️ **Важно:** TG Adapter — это **отдельный сервис**, код которого НЕ включён в текущий репозиторий. Его нужно создать отдельно или временно удалить из `render.yaml`.

### 7.2 Временное решение (если TG Adapter ещё не готов)
Закомментировать TG Adapter в `render.yaml`:
```yaml
# services:
#   - type: web
#     name: fastprep-tg-adapter
#     ...
```

И обновить env vars в **fastprep-admin-api** и **fastprep-admin-worker**:
```
TG_ADAPTER_URL=http://localhost:3001
TG_ADAPTER_TOKEN=stub_token
```

## Шаг 8: Frontend (следующий этап)

Frontend ещё не создан (папка `frontend/` отсутствует). Варианты:

### Вариант A: Удалить из render.yaml (временно)
Закомментировать в `render.yaml`:
```yaml
# - type: web
#   name: fastprep-admin-frontend
#   ...
```

### Вариант B: Создать заглушку
```bash
cd /Users/maratrubin/fastprep-admin
mkdir -p frontend/public
echo '<h1>FastPrep Admin - Coming Soon</h1>' > frontend/public/index.html
echo '{"name":"fp-frontend","scripts":{"build":"echo build"}}' > frontend/package.json
git add frontend && git commit -m "Add frontend stub" && git push
```

## Troubleshooting

### Проблема: `Build failed: npm install` для frontend
**Решение:** Удалить frontend из render.yaml или создать заглушку (см. выше)

### Проблема: `Database connection refused`
**Решение:** 
1. Проверить, что `DATABASE_URL` установлен в env vars
2. Убедиться, что Postgres service запущен и доступен

### Проблема: `Redis connection refused`
**Решение:**
1. Проверить, что `REDIS_URL` установлен
2. Убедиться, что Redis service запущен

### Проблема: Worker не обрабатывает outbox
**Решение:**
1. Проверить логи worker
2. Убедиться, что `TG_ADAPTER_URL` и `TG_ADAPTER_TOKEN` установлены
3. Временно закомментировать вызов TG Adapter в `worker.service.ts` для тестирования

## Следующие шаги

1. ✅ Blueprint создан
2. ✅ Env vars установлены
3. ✅ Миграция запущена
4. ✅ API работает (`/api/health` → 200)
5. ⏳ Frontend (следующий спринт)
6. ⏳ JWT middleware (auth guards)
7. ⏳ E2E тесты

---

**Время деплоя:** ~20-30 минут (включая настройку credentials)

