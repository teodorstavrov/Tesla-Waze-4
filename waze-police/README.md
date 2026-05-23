# waze-police

Production-grade Waze police marker ingestion microservice for the **Tesradar** project.

Fetches real-time POLICE alerts from the Waze Live Map API, normalizes and scores them, deduplicates spatially using PostGIS, and exposes a REST API for consumption.

---

## Architecture

```
waze-police/
├── migrations/           SQL schema (PostGIS, uuid-ossp)
├── src/
│   ├── config/           Zod-validated env config
│   ├── types/            TypeScript interfaces (Waze + Marker)
│   ├── db/               pg Pool, migrations runner, repositories
│   ├── cache/            ioredis client + session helpers
│   ├── geo/              Bulgaria tiling + bbox utilities
│   ├── ingestion/
│   │   ├── http/         Axios client + session manager
│   │   └── browser/      Playwright interception client
│   ├── processing/       filter → normalize → score → pipeline
│   ├── workers/          BullMQ ingestion + expiration workers
│   ├── scheduler/        Queue setup + repeatable job registration
│   ├── api/              Express routes + middleware
│   └── monitoring/       Pino logger + cycle metrics
├── Dockerfile            Multi-stage (builder + runtime)
└── docker-compose.yml    app + postgres/postgis + redis
```

---

## Requirements

| Tool | Version |
|------|---------|
| Node.js | 20 LTS |
| PostgreSQL | 15 + PostGIS 3.3 |
| Redis | 7 |
| Docker + Compose | latest |

---

## Quick start (Docker Compose)

```bash
# 1. Clone / enter directory
cd waze-police

# 2. Create .env (edit secrets)
cp .env.example .env

# 3. Build and start all services
docker compose up -d --build

# 4. Tail logs
docker compose logs -f app
```

The service will:
1. Wait for Postgres + Redis readiness
2. Run DB migrations automatically
3. Start the HTTP API on port **3001**
4. Trigger an immediate ingestion cycle
5. Schedule repeatable jobs (ingest every 2h, expire every 15m)

---

## Local development (without Docker)

### Prerequisites

```bash
# PostgreSQL with PostGIS
# Redis

# Node 20
node -v  # v20.x
```

### Setup

```bash
cd waze-police
npm install

# Install Playwright Chromium
npx playwright install chromium --with-deps

# Copy and edit env
cp .env.example .env
```

### Edit `.env`

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/waze_police
REDIS_URL=redis://localhost:6379
PORT=3001
NODE_ENV=development
LOG_LEVEL=debug
LOG_PRETTY=true
PLAYWRIGHT_HEADLESS=true
```

### Run

```bash
# Run migrations
npm run migrate

# Start in dev mode (tsx watch — hot reload)
npm run dev
```

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Hot-reload dev server (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/index.js` |
| `npm run migrate` | Run SQL migrations |
| `npm run discover` | Standalone Playwright session + tile discovery |

---

## REST API

Base URL: `http://localhost:3001`

### `GET /police/live`

Returns currently active (non-expired) police markers.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `bbox` | string | — | `minLat,minLng,maxLat,maxLng` — filter by bounding box |
| `min_score` | number | `0` | Minimum score (0–100) |
| `limit` | number | `500` | Max results (max 1000) |

**Example:**
```
GET /police/live?bbox=41.5,22.5,44.0,28.5&min_score=30&limit=100
```

**Response:**
```json
{
  "count": 12,
  "markers": [
    {
      "id": "uuid",
      "waze_uuid": "waze-internal-uuid",
      "type": "POLICE",
      "subtype": "POLICE_HIDING",
      "latitude": 42.691,
      "longitude": 23.322,
      "road_name": "A1",
      "city": "Sofia",
      "country": "BG",
      "confidence": 8,
      "reliability": 7,
      "thumbs_up": 3,
      "heading": 270,
      "road_type": 3,
      "score": 67,
      "created_at": "2026-05-23T10:00:00.000Z",
      "expires_at": "2026-05-23T11:30:00.000Z",
      "updated_at": "2026-05-23T10:15:00.000Z"
    }
  ],
  "fetched_at": "2026-05-23T10:20:00.000Z"
}
```

---

### `GET /police/bounds`

Returns configured bounding box for a country.

**Query parameters:**

| Param | Default |
|-------|---------|
| `country` | `BG` |

**Response:**
```json
{
  "country": "BG",
  "bbox": {
    "min_lat": 41.235,
    "min_lng": 22.36,
    "max_lat": 44.215,
    "max_lng": 28.609
  }
}
```

---

### `GET /stats`

Ingestion statistics.

**Response:**
```json
{
  "total_active": 47,
  "last_run": {
    "started_at": "2026-05-23T08:00:00.000Z",
    "finished_at": "2026-05-23T08:00:45.000Z",
    "strategy": "http",
    "inserted": 5,
    "updated": 12,
    "skipped": 30,
    "elapsed_ms": 44201,
    "success": true
  },
  "subtypes": {
    "POLICE_HIDING": 22,
    "POLICE_VISIBLE": 18,
    "GENERIC": 7
  },
  "avg_score": 58.3,
  "runs_last_24h": 12
}
```

---

### `GET /health`

Connectivity check for PostgreSQL + Redis.

| Status | Code |
|--------|------|
| Both OK | 200 |
| Any failing | 503 |

---

### `GET /health/live`

Kubernetes liveness probe — always 200 if process is alive.

### `GET /health/ready`

Kubernetes readiness probe — 200 when DB + Redis are reachable.

---

## Scoring formula

```
score = reliability × 4        (max 40, reliability 0–10)
      + confidence  × 3        (max 30, confidence 0–10)
      + min(thumbs_up × 5, 20) (max 20)
      + freshness_bonus        (max 10)

freshness_bonus = max(0, 10 - floor(age_minutes / 9))

result clamped to [0, 100]
```

Markers older than 81 minutes receive 0 freshness bonus.

---

## Deduplication strategy

1. **Exact UUID match** — if `waze_uuid` already exists and is not expired → UPDATE
2. **Spatial 50m** — PostGIS `ST_DWithin(..., 50m geography)` finds nearby active markers → UPDATE
3. **New** — INSERT

The UPDATE path bumps `thumbs_up` (takes the higher value), `score`, `confidence`, `reliability`, and `updated_at`.

---

## Session management

Waze requires a valid browser session (cookies + User-Agent) to serve the georss API.

**Strategy waterfall:**

1. **Redis cache** — check for stored session (4h TTL). If fresh, use HTTP directly.
2. **Playwright capture** — if no session or 403 received: launch headless Chromium, navigate to `waze.com/live-map`, intercept the first georss XHR, extract cookies + UA + Referer. Store in Redis.
3. **Playwright direct** — if HTTP still fails after fresh capture: use Playwright to fetch the tile response directly (browser sees the full response).

---

## BullMQ jobs

| Job | Queue | Interval | Retries |
|-----|-------|----------|---------|
| `ingest-police` | `waze-ingest-police` | every 2h (7200000ms) | 3 × exponential (10s base) |
| `expire-markers` | `waze-expire-markers` | every 15m (900000ms) | 3 × exponential (5s base) |

An immediate ingestion is also triggered on every service startup.

---

## Database schema

**`police_markers`** — active police alerts
- `geom GEOMETRY(POINT, 4326)` — PostGIS spatial column, GIST indexed
- `expires_at TIMESTAMPTZ` — 90 minutes after `created_at`
- `waze_uuid VARCHAR UNIQUE` — Waze's internal ID for dedup
- `score DOUBLE PRECISION` — computed 0-100 quality score

**`ingestion_runs`** — audit log of every cycle

**`schema_migrations`** — applied migration versions

---

## Deployment

### Production environment variables

```dotenv
DATABASE_URL=postgresql://user:pass@db-host:5432/waze_police
REDIS_URL=redis://redis-host:6379
PORT=3001
NODE_ENV=production
API_SECRET=<strong-random-secret>
LOG_LEVEL=info
LOG_PRETTY=false
PLAYWRIGHT_HEADLESS=true
```

### Docker Compose (single server)

```bash
docker compose -f docker-compose.yml up -d --build
```

### Scaling considerations

**Horizontal scaling is NOT recommended** for the ingestion workers — running multiple instances will duplicate Waze API calls. Use a single instance for ingestion.

For the **HTTP API only** (read-only), horizontal scaling is safe:
```bash
# Scale API replicas (disable scheduler in additional instances)
INGEST_INTERVAL_MS=0 docker compose up -d --scale app=3
```

Or better: deploy a separate `api-only` mode by setting `DISABLE_SCHEDULER=true` (extend the service to check this env var).

### Kubernetes

A minimal deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: waze-police
spec:
  replicas: 1  # single instance — see scaling note
  template:
    spec:
      containers:
        - name: app
          image: your-registry/waze-police:latest
          ports:
            - containerPort: 3001
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3001
            initialDelaySeconds: 30
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3001
            initialDelaySeconds: 15
          envFrom:
            - secretRef:
                name: waze-police-secrets
```

---

## Monitoring

All operations emit structured JSON logs via **Pino**.

Key log events:

| Event | Level | Fields |
|-------|-------|--------|
| Ingestion cycle complete | `info` | `tiles_fetched, raw_count, police_count, inserted, updated, skipped, errors, elapsed_ms, strategy` |
| HTTP auth failure | `warn` | `status, attempt, url` |
| Playwright session capture | `info` | `elapsed_ms, ua` |
| DB upsert error | `warn` | `err, waze_uuid` |
| Worker job failed | `error` | `job_id, err` |

For Prometheus metrics, pipe Pino JSON to a log aggregator (e.g. Grafana Loki + Alloy).

---

## Troubleshooting

### Empty markers after startup

1. Check `/health` — both `database` and `redis` must be `ok`
2. Check `/stats` — confirm `last_run` has a recent `started_at`
3. Check logs for `strategy: "playwright"` — Playwright may be slow on first run
4. Run `npm run discover` to manually test session capture

### 403 errors from Waze

Waze actively blocks known datacenter IPs. Options:
- Add a residential/mobile proxy: extend `waze-http.client.ts` to use `httpsAgent` with `https-proxy-agent`
- Use Playwright only mode (disable HTTP path by clearing Redis session)

### Playwright timeout

- Ensure `--no-sandbox` flag is present (required in Docker)
- Increase `PLAYWRIGHT_HEADLESS=false` to debug visually in local dev
- Waze may have changed its DOM — run `npm run discover` to re-test

### PostGIS extension missing

```sql
-- Connect to your DB and run:
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

The `postgis/postgis:15-3.3` Docker image includes both extensions automatically.

---

## License

Internal — Tesradar project. All rights reserved.
