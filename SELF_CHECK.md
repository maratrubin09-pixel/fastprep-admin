# SELF-CHECK (Sprint 2-3 Implementation)

## ✅ Security
- [x] Секреты не в коде (все в `.env`, `.env.example` без реальных значений)
- [x] Pre-signed URL не в логах (используется только `objectKey` в логах, не сами URL)
- [x] CORS/CSP корректны (`CORS_ORIGIN` в env, `cors: true` в NestJS)
- [x] S3 bucket приватный (требуется presigned GET для скачивания)
- [x] JWT authentication предполагается (req.user.id в контроллерах)

## ✅ AuthZ
- [x] Кэш ключ `authz:ep:{userId}` (см. `authz.service.ts`)
- [x] Сравнение `ep.ver` vs `users.perm_version` (см. `authz.service.ts:getEffectivePermissions`)
- [x] Инвалидация: `perm_version++` → `DEL` → `PUBLISH` (см. `authz.service.ts:invalidateUser`)
- [x] CTE-вычисление EP (роли ⊕ оверрайды + `user_channel_access`) в `authz.repo.ts`

## ✅ RT (WebSocket)
- [x] Фильтрация manager/agent (см. `ws.gateway.ts:canViewThread`)
- [x] Redis-ключи `inbox:assignee:{threadId}`, `inbox:unassigned` (см. `inbox.service.ts`)
- [x] Подписка на `authz.user.updated` (см. `ws.gateway.ts:constructor`)
- [x] O(1) проверки (Redis GET/SISMEMBER)

## ✅ Attachments
- [x] Тип/размер проверяются (см. `uploads.controller.ts` и `messages.controller.ts`)
- [x] Префикс проверяется (`inbox/{threadId}/`) в `messages.controller.ts`
- [x] GET-ссылки краткоживущие (300s по умолчанию, см. `s3.service.ts:createPresignedGet`)
- [x] HEAD-проверка перед принятием сообщения (см. `messages.controller.ts`)

## ✅ Outbox
- [x] Lease атомарный (CTE + `FOR UPDATE SKIP LOCKED`, см. `worker.service.ts:leaseBatch`)
- [x] Backoff с джиттером (экспоненциальный + `Math.random()`, см. `worker.service.ts:markRetry`)
- [x] Идемпотентность по `external_message_id` (обновляется в `messages` после успеха)
- [x] Метрики растут (`outbox_processed_total`, `adapter_latency_seconds`, см. `metrics.service.ts`)
- [x] Алёрт шлётся (Slack webhook + порог/окно/кулдаун, см. `alerts.service.ts`)

## ✅ DR (Disaster Recovery)
- [x] `render.yaml` в корне (определяет все сервисы, БД, env)
- [x] `docs/runbook.md` обновлён (явный пункт о `render.yaml` как главном DR-инструменте)
- [x] Grafana/Prometheus артефакты (`grafana_outbox_dashboard.json`, `prometheus_outbox_rules.yaml`)

## ✅ Code Quality
- [x] TypeScript компилируется без ошибок (проверено `npm run build`)
- [x] Линтер проходит (no linter errors)
- [x] Домены изолированы (`authz`, `inbox`, `storage`, `redis`, `db`, `worker`)
- [x] Зависимости корректны (`package.json` содержит все необходимые пакеты)

## ✅ Migrations/Seeding
- [x] SQL-миграция `001_initial_schema.sql` создана (схема БД + seed ролей/admin)

## ⚠️ Pending (требуют доработки после деплоя)
- [ ] JWT middleware (auth guards) — нужно добавить после выбора стратегии (passport-jwt, custom)
- [ ] Unit/E2E тесты — каркас создан, тесты добавляются по мере разработки
- [ ] Email-алёрты (alerts.service.ts) — заглушка, нужен SMTP-транспорт (nodemailer)
- [ ] TG Adapter — отдельный сервис, код не включён в этот репозиторий

## Готовность
**Backend Skeleton (Спринт 2-3):** ✅ **DONE**

Следующие шаги:
1. Коммит и пуш в GitHub: https://github.com/maratrubin09-pixel/fastprep-admin
2. Deploy на Render через Blueprint (`render.yaml`)
3. Настроить env vars (секретные значения)
4. Запустить миграцию `001_initial_schema.sql`
5. Проверить `/api/health` → 200
6. Добавить JWT middleware
7. Frontend (React+TS+MUI) — следующий спринт






