# FastPrep Admin Panel

NestJS (Node 20) backend with Redis-cached AuthZ, WebSocket real-time, S3 attachments, and Outbox Worker.

## Features

- **AuthZ Cache (Redis):** O(1) permission checks with version-based invalidation.
- **WebSocket (RT):** Real-time events with role-based filtering (manager vs agent).
- **S3/R2 Attachments:** Presigned PUT for uploads, server-side validation, private bucket.
- **Outbox Worker:** Separate process with lease-based concurrency, backoff, metrics, and Slack alerts.
- **DR/IaC:** `render.yaml` in root for complete infrastructure recovery.

## Tech Stack

- **Runtime:** Node 20
- **Framework:** NestJS
- **Database:** PostgreSQL
- **Cache:** Redis (ioredis)
- **Storage:** S3/Cloudflare R2
- **Metrics:** prom-client (Prometheus)
- **Deployment:** Render

## Project Structure

```
src/
  main.ts               # API entry point
  modules/app.module.ts # Root module
  redis/                # Redis client (global)
  db/                   # Postgres Pool (global)
  authz/                # AuthZ repo/service/guard + /api/auth/me/ep
  inbox/                # Inbox service, WS gateway, uploads/messages controllers
  storage/              # S3 service
  worker/               # Outbox worker (separate process)
    main.ts             # Worker entry point
    worker.service.ts   # Lease + process logic
    metrics.service.ts  # prom-client metrics
    alerts.service.ts   # Slack/email alerts
docs/
  runbook.md            # Ops runbook (DR, troubleshooting)
  grafana_outbox_dashboard.json
  prometheus_outbox_rules.yaml
render.yaml             # IaC for Render deployment
```

## Local Development

### Prerequisites

- Node 20
- PostgreSQL (local or remote)
- Redis (local or remote)
- S3-compatible storage (Cloudflare R2, MinIO, etc.)

### Setup

1. Clone repo:
   ```bash
   git clone https://github.com/maratrubin09-pixel/fastprep-admin.git
   cd fastprep-admin
   ```

2. **First-time GitHub SSH setup** (if you need to push code):
   ```bash
   # Run the setup script
   ./scripts/setup_gh_ssh.sh
   
   # Follow the instructions to:
   # 1. Copy the public key from terminal output
   # 2. Add it to GitHub: https://github.com/settings/keys
   # 3. Test connection: ssh -T git@github.com
   # 4. Push code: git push -u origin main
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env` and fill in values:
   ```bash
   cp .env.example .env
   # Edit .env with your DATABASE_URL, REDIS_URL, S3 credentials, etc.
   ```

5. Run database migrations (if any):
   ```bash
   # TODO: add migration tool (e.g., node-pg-migrate or TypeORM)
   ```

6. Start API:
   ```bash
   npm run start:dev
   ```

7. Start Outbox Worker (in separate terminal):
   ```bash
   npm run start:worker
   ```

8. API available at `http://localhost:3000/api`
9. Metrics at `http://localhost:9090/metrics` (worker)

## Deployment

**Primary Method:** Render Blueprint via `render.yaml`

1. Push code to GitHub.
2. In Render Dashboard, create a new Blueprint.
3. Connect repository and select `render.yaml`.
4. Render will provision all services automatically.
5. Manually set sensitive env vars (see `/docs/runbook.md`).

## API Endpoints

- `GET /api` — API info
- `GET /api/health` — Health check
- `GET /api/auth/me/ep` — Get effective permissions (AuthZ)
- `POST /api/inbox/uploads/presign` — Get presigned PUT URL for attachment upload
- `POST /api/inbox/threads/:id/messages` — Send message (with optional attachment validation)

## WebSocket

- Namespace: `/ws`
- Handshake: `{ auth: { userId: "..." } }`
- Events:
  - `hello` → `{ ver, perms }`
  - `ep.update` → `{ ver, perms }` (on permission change)
  - Inbox events (filtered by role/assignment)

## Monitoring

- **Metrics:** Prometheus endpoint on worker `:9090/metrics`
- **Dashboards:** Import `/docs/grafana_outbox_dashboard.json`
- **Alerts:** Apply `/docs/prometheus_outbox_rules.yaml` to AlertManager
- **Logs:** Render Dashboard → Logs tab for each service

## Testing

```bash
npm test
```

(Add unit/e2e tests as needed)

## License

UNLICENSED (private project)

## Contact

For issues or questions, contact the FastPrep Platform team.

