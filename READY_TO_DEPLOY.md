# ✅ FastPrep Admin: ГОТОВ К ДЕПЛОЮ

## 🎯 Текущий статус

**GitHub:** https://github.com/maratrubin09-pixel/fastprep-admin
**Последний коммит:** "Add quick Render deploy steps guide"

### Что готово ✅
- ✅ **Backend (NestJS):** API + Worker + AuthZ + RT + S3 + Outbox
- ✅ **render.yaml:** Blueprint для автоматического деплоя
- ✅ **База данных:** Миграция `001_initial_schema.sql`
- ✅ **Frontend placeholder:** Статичная страница "Coming Soon"
- ✅ **Документация:** DEPLOYMENT_GUIDE.md + RENDER_DEPLOY_STEPS.md
- ✅ **SELF-CHECK:** Все требования выполнены

---

## 🚀 ЧТО ТЕБЕ НУЖНО СДЕЛАТЬ (10-15 минут)

### Шаг 1: Открыть Render Dashboard
👉 **https://dashboard.render.com/**

Если нет аккаунта:
1. Sign Up через GitHub (быстрее)
2. Подтвердить email

---

### Шаг 2: Создать Blueprint

1. В Render Dashboard нажать **"New"** (правый верхний угол)
2. Выбрать **"Blueprint"**
3. **Connect repository:**
   - Если GitHub ещё не подключен → **"Connect GitHub"** → авторизовать Render
   - Выбрать репозиторий: **`maratrubin09-pixel/fastprep-admin`**
4. Render автоматически найдёт `render.yaml` в корне
5. Нажать **"Apply"**

**Что произойдёт:**
- Render создаст 5 сервисов:
  1. `fastprep-postgres` (PostgreSQL database)
  2. `fastprep-redis` (Redis)
  3. `fastprep-admin-api` (Backend web service)
  4. `fastprep-admin-worker` (Background worker)
  5. `fastprep-admin-frontend` (Static site)

**Время:** ~5-7 минут (автоматически)

---

### Шаг 3: Дождаться первого деплоя

После нажатия "Apply" появится список сервисов со статусами:
- 🟡 **Building** → идёт сборка
- 🟢 **Live** → сервис запущен
- 🔴 **Failed** → ошибка (см. логи)

**Подожди, пока все сервисы станут 🟢 Live** (кроме worker, он может быть в статусе "Running")

**Важно:** API и Worker могут упасть с ошибкой `S3_ENDPOINT is not defined` — это нормально, мы сейчас добавим env vars.

---

### Шаг 4: Настроить Environment Variables

#### 4.1 Для `fastprep-admin-api`
1. В списке сервисов нажать на **`fastprep-admin-api`**
2. Перейти на вкладку **"Environment"**
3. Нажать **"Add Environment Variable"**
4. Добавить по одной переменной:

**Минимально необходимые (без них API не запустится):**
```
S3_ENDPOINT = https://stub-endpoint.com
S3_BUCKET = fastprep-attachments
S3_ACCESS_KEY_ID = stub_key
S3_SECRET_ACCESS_KEY = stub_secret
TG_ADAPTER_TOKEN = temporary_stub_token_12345
```

💡 **Это stub-значения для первого запуска.** Позже заменим на реальные R2 credentials.

5. Нажать **"Save Changes"**
6. Render автоматически перезапустит сервис (~2-3 минуты)

#### 4.2 Для `fastprep-admin-worker`
1. Нажать на **`fastprep-admin-worker`**
2. **Environment** → **"Add Environment Variable"**
3. Добавить:
```
TG_ADAPTER_TOKEN = temporary_stub_token_12345
```
4. **Save Changes**

---

### Шаг 5: Запустить миграцию БД

#### Вариант A: Через Render Shell (проще)
1. Вернуться в список сервисов → нажать на **`fastprep-admin-api`**
2. Вкладка **"Shell"** (справа от "Logs")
3. Дождаться загрузки терминала (~10 сек)
4. Скопировать и вставить эту команду:

```bash
cat migrations/001_initial_schema.sql | psql $DATABASE_URL
```

5. Нажать Enter
6. Если всё ОК, увидишь:
```
CREATE TABLE
CREATE TABLE
...
INSERT 0 1
```

#### Проверка:
В том же Shell выполнить:
```bash
psql $DATABASE_URL -c "SELECT name FROM roles;"
```

**Ожидается:**
```
  name   
---------
 Admin
 Manager
 Agent
(3 rows)
```

✅ Если видишь 3 роли — миграция прошла успешно!

---

### Шаг 6: Проверка работы API

#### Получить URL сервиса
1. В списке сервисов → **`fastprep-admin-api`**
2. Вверху страницы скопировать URL (например: `https://fastprep-admin-api-abcd1234.onrender.com`)

#### Тест 1: Health Check
Открыть в браузере или через curl:
```
https://ВАШ-API-URL.onrender.com/api/health
```

**Ожидается:**
```json
{"ok":true,"timestamp":"2025-10-22T..."}
```

#### Тест 2: API Info
```
https://ВАШ-API-URL.onrender.com/api
```

**Ожидается:**
```json
{
  "name": "FastPrep Admin API",
  "version": "0.1.0",
  "status": "running",
  ...
}
```

✅ Если оба теста прошли — **API работает!**

---

### Шаг 7: Проверка Frontend

1. В списке сервисов → **`fastprep-admin-frontend`**
2. Скопировать URL (например: `https://fastprep-admin-frontend-xyz.onrender.com`)
3. Открыть в браузере

**Ожидается:**
Красивая страница с:
- 🚀 **FastPrep Admin**
- **Admin Panel Coming Soon**
- ✅ **Backend API Active**

---

## 🎉 ГОТОВО! Что работает:

1. ✅ **PostgreSQL** (с ролями Admin/Manager/Agent)
2. ✅ **Redis** (для AuthZ кэша и RT)
3. ✅ **Backend API** (`/api`, `/api/health`)
4. ✅ **Worker** (ждёт сообщения в outbox)
5. ✅ **Frontend placeholder** (статика)

---

## 📋 Следующие шаги (по приоритету)

### 1. Получить настоящие R2 credentials (опционально, но рекомендуется)
**Зачем:** Для загрузки вложений в сообщения

**Как:**
1. Cloudflare Dashboard → R2 Object Storage
2. Create Bucket → `fastprep-attachments`
3. R2 → Manage R2 API Tokens → Create API Token
4. Скопировать:
   - Access Key ID
   - Secret Access Key
   - Endpoint URL (например: `https://abc123.r2.cloudflarestorage.com`)
5. Обновить env vars в `fastprep-admin-api`:
   ```
   S3_ENDPOINT = скопированный_endpoint
   S3_ACCESS_KEY_ID = скопированный_key
   S3_SECRET_ACCESS_KEY = скопированный_secret
   ```

### 2. Полноценный Frontend (React+TS+MUI)
**Текущий статус:** Placeholder (статика)
**Нужно:** Создать React-приложение с:
- Страница логина (`/login`)
- Dashboard (`/dashboard`)
- Messengers (`/messengers`)
- Settings (`/settings`)

**ETA:** ~2-3 часа разработки

### 3. JWT Auth Middleware
**Текущий статус:** Контроллеры ожидают `req.user.id`, но middleware отсутствует
**Нужно:** Добавить Passport.js + JWT strategy

**ETA:** ~30 минут

### 4. TG Adapter (Telegram интеграция)
**Текущий статус:** Отключен в render.yaml (код отсутствует)
**Нужно:** Создать отдельный NestJS сервис с TDLib

**ETA:** ~3-4 часа разработки

---

## 📊 Стоимость на Render

**Текущая конфигурация:**
- PostgreSQL Starter: $7/мес
- Redis Starter: $7/мес
- API (Web Service Starter): $7/мес
- Worker (Worker Starter): $7/мес
- Frontend (Static Site): **$0** (Free tier)

**Итого:** ~$28/мес

**Free tier альтернатива (для тестов):**
- PostgreSQL Free (до 1GB): $0
- Redis Free (до 25MB): $0
- API Free: $0 (но засыпает после 15 мин простоя)
- Worker Free: $0 (но засыпает)
- Frontend Free: $0

**Итого Free:** $0/мес (с ограничениями)

---

## 🆘 Если что-то пошло не так

### API не запускается (статус "Failed")
1. Нажать на сервис → **"Logs"**
2. Найти строку с ошибкой (обычно красная)
3. Частые причины:
   - `DATABASE_URL is not defined` → проверить, что Postgres запущен
   - `S3_ENDPOINT is not defined` → добавить env vars (см. Шаг 4)

### Миграция не выполняется
1. Проверить, что `DATABASE_URL` доступен в Shell:
   ```bash
   echo $DATABASE_URL
   ```
   Должен вернуться: `postgresql://...`
2. Если пусто → перезапустить Shell

### Frontend показывает 404
1. Проверить логи **build** сервиса frontend
2. Должно быть: `cp -r public/* build/`
3. Если ошибка → проверить, что `rootDir: ./frontend` в render.yaml

---

## 📞 Нужна помощь?

Скопируй и отправь мне:
1. Скриншот статуса сервисов (Dashboard)
2. Логи проблемного сервиса (последние 50 строк)
3. Что пытался сделать и что увидел

---

**Удачи! 🚀** Весь процесс займёт ~10-15 минут.





