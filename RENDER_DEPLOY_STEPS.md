# 🚀 Render Deploy: Quick Steps

## Готовность
✅ Код запушен в GitHub: https://github.com/maratrubin09-pixel/fastprep-admin
✅ `render.yaml` в корне (Blueprint готов)
✅ Frontend placeholder создан
✅ TG Adapter временно отключен

## Шаги для деплоя (5-10 минут)

### 1. Открыть Render Dashboard
👉 https://dashboard.render.com/

### 2. Создать Blueprint
1. Нажать **"New"** → **"Blueprint"**
2. **Repository:** выбрать `maratrubin09-pixel/fastprep-admin`
3. Render найдёт `render.yaml` → нажать **"Apply"**

Это создаст автоматически:
- ✅ `fastprep-postgres` (PostgreSQL)
- ✅ `fastprep-redis` (Redis)
- ✅ `fastprep-admin-api` (Web Service)
- ✅ `fastprep-admin-worker` (Worker)
- ✅ `fastprep-admin-frontend` (Static Site)

**Время создания:** ~5-7 минут

---

### 3. Настроить Environment Variables

#### 3.1 Для `fastprep-admin-api`
Зайти в сервис → **Environment** → добавить:

**S3/R2 (Cloudflare R2 или AWS S3):**
```
S3_ENDPOINT=https://ваш-аккаунт.r2.cloudflarestorage.com
S3_BUCKET=fastprep-attachments
S3_ACCESS_KEY_ID=ваш_key
S3_SECRET_ACCESS_KEY=ваш_secret
```

**TG Adapter Token (пока stub):**
```
TG_ADAPTER_TOKEN=temporary_stub_token_123456
```

💡 **Как получить R2:**
1. Cloudflare Dashboard → R2 → Create Bucket: `fastprep-attachments`
2. R2 → API Tokens → Create → скопировать credentials

#### 3.2 Для `fastprep-admin-worker`
Зайти в сервис → **Environment** → добавить:
```
TG_ADAPTER_TOKEN=temporary_stub_token_123456
```

**Опционально (Slack alerts):**
```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
```

#### 3.3 Автогенерируемые (уже созданы Render)
- ✅ `JWT_SECRET`
- ✅ `CSRF_SECRET`
- ✅ `DATABASE_URL`
- ✅ `REDIS_URL`

---

### 4. Запустить миграцию БД

#### Вариант A: Через psql локально
```bash
# Скопировать "External Database URL" из fastprep-postgres → Info
cd /Users/maratrubin/fastprep-admin
psql "postgresql://user:pass@host:5432/dbname" < migrations/001_initial_schema.sql
```

#### Вариант B: Через Render Shell
1. `fastprep-admin-api` → **Shell**
2. Внутри шелла:
```bash
cat migrations/001_initial_schema.sql | psql $DATABASE_URL
```

#### Проверка:
```bash
psql $DATABASE_URL -c "SELECT name FROM roles;"
# Должны быть: Admin, Manager, Agent
```

---

### 5. Проверка работы API

#### Health Check
```bash
curl https://fastprep-admin-api.onrender.com/api/health
```
**Ожидается:** `{"ok":true,"timestamp":"..."}`

#### API Info
```bash
curl https://fastprep-admin-api.onrender.com/api
```
**Ожидается:** `{"name":"FastPrep Admin API","version":"0.1.0",...}`

#### Логи
`fastprep-admin-api` → **Logs**
- Должно быть: `API listening on :10000`

---

### 6. Проверка Worker

`fastprep-admin-worker` → **Logs**
- Должно быть:
  - `Outbox Worker starting...`
  - `Metrics server listening on :9090`

---

### 7. Проверка Frontend

Открыть: https://fastprep-admin-frontend.onrender.com

Должна открыться placeholder-страница:
**"🚀 FastPrep Admin - Coming Soon"**

---

## Готово! 🎉

### Что работает:
- ✅ API (`/api`, `/api/health`)
- ✅ PostgreSQL (с миграцией)
- ✅ Redis
- ✅ Worker (outbox processor)
- ✅ Frontend placeholder

### Следующие шаги:
1. **Frontend (React+TS+MUI)** — полноценный UI (спринт 4)
2. **JWT Auth** — middleware для защиты эндпоинтов
3. **TG Adapter** — отдельный сервис (спринт 5)
4. **E2E тесты** — автотесты на проде

---

## Troubleshooting

### API не запускается
- Проверить логи → если `DATABASE_URL` ошибка → убедиться, что Postgres запущен
- Проверить env vars → все ли установлены

### Worker не обрабатывает сообщения
- Временно ожидаемо (TG Adapter stub)
- Проверить логи worker → должен быть запущен, метрики доступны

### Frontend 404
- Проверить, что `rootDir: ./frontend` установлен в render.yaml
- Проверить логи build → должен быть `cp -r public/* build/`

---

**Время деплоя:** ~10-15 минут (с credentials)
**Стоимость:** ~$21/мес (Postgres+Redis+API+Worker, без TG Adapter)





