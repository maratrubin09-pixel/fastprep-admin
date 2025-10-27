# FastPrep Admin Runbook

## Disaster Recovery

**Primary DR Tool:** `render.yaml` in the root of this repository.

This file defines the entire infrastructure-as-code (IaC) for our Render deployment:
- API (web service)
- Outbox Worker (worker service)
- TG Adapter (web service with persistent disk)
- Frontend (static site)
- PostgreSQL database
- Redis instance

### Recovery Steps

1. **Complete Infrastructure Loss:**
   - Create a new Render Blueprint from the repository.
   - Render will automatically provision all services, databases, and environment variables based on `render.yaml`.
   - Manually set sensitive environment variables (marked `sync: false` in `render.yaml`):
     - `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
     - `TG_ADAPTER_TOKEN`, `TG_API_ID`, `TG_API_HASH`, `TDLIB_ENCRYPTION_KEY`
     - `SLACK_WEBHOOK_URL`
   - Run database migrations (if any) via Render Shell or local connection.
   - Verify health: `curl https://fastprep-admin-api.onrender.com/api/health`

2. **Partial Service Failure:**
   - Use Render Dashboard to restart the failed service.
   - Check logs for errors (Render → Logs tab).
   - For worker issues, check `/metrics` endpoint on port 9090 (if exposed) or Render logs.

3. **Database Recovery:**
   - Render Postgres provides automatic backups (retention depends on plan).
   - Restore from Render Dashboard → Database → Backups tab.
   - After restore, invalidate all Redis caches (FLUSHDB or targeted DEL).

## AuthZ Cache Invalidation

- **Automatic:** When permissions/roles change, call `authzService.invalidateUser(userId)` to increment `perm_version`, delete Redis cache, and publish `authz.user.updated`.
- **Manual (emergency):** Connect to Redis and run:
  ```
  DEL authz:ep:{userId}
  PUBLISH authz.user.updated '{"userId":"<userId>"}'
  ```
- **Bulk Flush:** If all EP caches need refresh (e.g., after schema change):
  ```
  redis-cli -u $REDIS_URL
  SCAN 0 MATCH authz:ep:* COUNT 100
  # For each key: DEL <key>
  ```

## Outbox Worker Monitoring

- **Metrics Endpoint:** `http://fastprep-admin-worker:9090/metrics` (internal Render network, or expose via service)
- **Key Metrics:**
  - `outbox_processed_total{status="done"}` — успешно отправленные
  - `outbox_processed_total{status="failed"}` — финальные ошибки
  - `outbox_processed_total{status="retry"}` — повторные попытки
  - `adapter_latency_seconds` — задержка вызовов TG Adapter

- **Alerts:**
  - Configured via `SLACK_WEBHOOK_URL` and alert thresholds in env vars.
  - If `FAIL_ALERT_THRESHOLD` failed messages occur within `FAIL_ALERT_WINDOW_SEC`, Slack webhook is triggered.
  - Cooldown: `FAIL_ALERT_COOLDOWN_SEC` (default 1 hour).

- **Manual Intervention:**
  - Connect to Postgres and query `outbox` table:
    ```sql
    SELECT * FROM outbox WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 100;
    ```
  - To retry failed messages, reset status:
    ```sql
    UPDATE outbox SET status = 'pending', attempts = 0, scheduled_at = NOW() WHERE status = 'failed';
    ```
  - Worker will pick them up on the next cycle.

## WebSocket Real-Time Issues

- **Symptoms:** Clients not receiving `ep.update` or inbox events.
- **Check:**
  - Redis Pub/Sub is working: `redis-cli -u $REDIS_URL` → `SUBSCRIBE authz.user.updated` → trigger a permission change → verify message.
  - WebSocket connections: Render logs for `fastprep-admin-api` should show `WebSocketGateway` logs.
- **Fix:**
  - Restart API service (Render Dashboard).
  - Verify CORS settings for WebSocket handshake.

## S3/R2 Attachments

- **Pre-signed URLs:** Valid for 600s (PUT) and 300s (GET by default).
- **Validation:** Server-side HEAD check before accepting message with attachment.
- **Security:** Private bucket, no public access. GET URLs generated on-demand with PEP check.
- **Troubleshooting:**
  - If uploads fail, check S3 credentials and endpoint in env vars.
  - Verify bucket CORS policy allows PUT from frontend origin.

## Grafana/Prometheus Setup

- Import `/docs/grafana_outbox_dashboard.json` to Grafana (connect to Prometheus scraping worker `/metrics`).
- Apply `/docs/prometheus_outbox_rules.yaml` to Prometheus AlertManager for automated alerts.

## Common Issues

1. **401 on `/api/auth/me/ep`:** JWT middleware not installed/configured. Check auth guards in routes.
2. **Blank dashboard:** Redis or DB connection failure. Check `DATABASE_URL` and `REDIS_URL`.
3. **Worker not processing:** Verify worker service is running on Render. Check env vars `TG_ADAPTER_URL`, `TG_ADAPTER_TOKEN`.
4. **High `adapter_latency_seconds`:** TG Adapter may be slow/overloaded. Scale TG Adapter or investigate network issues.

## Contact

For escalations, contact the DevOps/Platform team or check Slack channel `#fastprep-alerts`.






