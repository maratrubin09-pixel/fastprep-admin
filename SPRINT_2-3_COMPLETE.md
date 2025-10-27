# ✅ Sprint 2-3 COMPLETE

## Что реализовано

### 1. **AuthZ-кэш в Redis** ✅
- `authz.repo.ts`: CTE-вычисление EP (роли ⊕ оверрайды + user_channel_access)
- `authz.service.ts`: Кэш EP с ключом `authz:ep:{userId}`, TTL 600s, версионирование через `perm_version`
- Инвалидация: `perm_version++` → `DEL` кэш → `PUBLISH authz.user.updated`
- `pep.guard.ts`: PEP-гард с декоратором `@RequirePerm`
- `ep.controller.ts`: `GET /api/auth/me/ep` → `{ ver, permissions, allowedChannels }`

### 2. **WebSocket (RT)** ✅
- `ws.gateway.ts`: Namespace `/ws`, hello с EP, подписка на `authz.user.updated`
- Фильтрация событий: менеджер (inbox.read_all) vs агент (assignee/allowedChannels/unassigned)
- O(1) проверки через Redis: `inbox:assignee:{threadId}`, `inbox:unassigned`

### 3. **S3/R2 Attachments** ✅
- `s3.service.ts`: Presigned PUT/GET, HEAD-проверка
- `uploads.controller.ts`: `POST /api/inbox/uploads/presign` → лимиты типов/размера
- `messages.controller.ts`: `POST /api/inbox/threads/:id/messages` → валидация вложений (префикс, HEAD)
- Приватный бакет, GET-ссылки краткоживущие

### 4. **Outbox Worker** ✅
- `worker/main.ts`: Отдельный процесс
- `worker.service.ts`: Lease через CTE + `FOR UPDATE SKIP LOCKED`, backoff с джиттером, MAX_ATTEMPTS → failed
- `metrics.service.ts`: `outbox_processed_total{status}`, `adapter_latency_seconds` (prom-client)
- `alerts.service.ts`: Slack webhook + порог/окно/кулдаун
- Вызов TG-Adapter: `POST {TG_ADAPTER_URL}/api/send` (Bearer token)

### 5. **IaC/DR** ✅
- `render.yaml` в корне: API (web), Worker (worker), TG-Adapter (web с диском), Frontend (static), Postgres, Redis
- `docs/runbook.md`: Явный пункт о render.yaml как главном DR-инструменте
- `docs/grafana_outbox_dashboard.json`, `docs/prometheus_outbox_rules.yaml`

### 6. **База данных** ✅
- `migrations/001_initial_schema.sql`: Полная схема (users, roles, permissions, outbox, audit_logs) + seed Admin/Manager/Agent ролей

## Структура проекта

```
fastprep-admin/
├── render.yaml               # IaC (Render Blueprint)
├── package.json              # NestJS deps (Node 20)
├── tsconfig.json
├── .env.example              # Все env vars без секретов
├── .gitignore
├── README.md                 # Обзор проекта
├── SELF_CHECK.md             # Чек-лист по требованиям
├── src/
│   ├── main.ts               # API entry point
│   ├── modules/app.module.ts
│   ├── routes/health.controller.ts  # /api + /api/health
│   ├── redis/redis.module.ts
│   ├── db/db.module.ts
│   ├── authz/
│   │   ├── authz.module.ts
│   │   ├── authz.repo.ts     # CTE-вычисление EP
│   │   ├── authz.service.ts  # Кэш + инвалидация
│   │   ├── pep.guard.ts      # @RequirePerm
│   │   └── ep.controller.ts  # GET /api/auth/me/ep
│   ├── storage/
│   │   ├── storage.module.ts
│   │   └── s3.service.ts     # Presigned PUT/GET
│   ├── inbox/
│   │   ├── inbox.module.ts
│   │   ├── inbox.service.ts  # Assign/unassign, createOutgoingMessage
│   │   ├── uploads.controller.ts  # POST /api/inbox/uploads/presign
│   │   ├── messages.controller.ts # POST /api/inbox/threads/:id/messages
│   │   └── ws.gateway.ts     # WebSocket RT
│   └── worker/
│       ├── worker.module.ts
│       ├── main.ts           # Worker entry point
│       ├── worker.service.ts # Lease + process + TG-Adapter
│       ├── metrics.service.ts
│       └── alerts.service.ts
├── migrations/
│   └── 001_initial_schema.sql
└── docs/
    ├── runbook.md
    ├── grafana_outbox_dashboard.json
    └── prometheus_outbox_rules.yaml
```

## SELF-CHECK (все ✅)

- ✅ Security: секреты в env, no pre-signed URL в логах, CORS/CSP ok
- ✅ AuthZ: кэш `authz:ep:{userId}`, version check, инвалидация
- ✅ RT: фильтрация manager/agent, Redis O(1), ep.update
- ✅ Attachments: тип/размер/префикс, GET краткоживущие
- ✅ Outbox: lease атомарный, backoff+джиттер, метрики, алёрты
- ✅ DR: `render.yaml` в корне, runbook обновлён, Grafana/Prom артефакты

## Деплой (следующий шаг)

1. **GitHub:** Код запушен в https://github.com/maratrubin09-pixel/fastprep-admin
2. **Render:**
   - Создать Blueprint из репозитория (render.yaml)
   - Установить секретные env vars:
     - `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
     - `TG_ADAPTER_TOKEN`, `TG_API_ID`, `TG_API_HASH`, `TDLIB_ENCRYPTION_KEY`
     - `SLACK_WEBHOOK_URL`
3. **Миграция:** Запустить `001_initial_schema.sql` в Postgres (Render Shell)
4. **Проверка:**
   - `curl https://fastprep-admin-api.onrender.com/api` → 200
   - `curl https://fastprep-admin-api.onrender.com/api/health` → `{"ok":true}`
5. **Frontend:** Следующий спринт (React+TS+MUI)

## ETA финальной готовности

- **Backend (Спринты 2-3):** ✅ DONE (~2 часа)
- **Frontend (Спринт 4):** ~1.5 часа
- **Render Deploy + тесты (Спринт 5):** ~1 час
- **Итого:** 4.5 часа для полной готовности

---

**Статус:** Backend готов к деплою. Ожидается подтверждение для переход к Frontend.






