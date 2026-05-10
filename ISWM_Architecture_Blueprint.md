# ISWM Real-Time Vehicle Tracking — Full Architecture Blueprint

> **Stack:** Go 1.22+ · Next.js 14 · Redis 7 · TimescaleDB · PostgreSQL 16 + PostGIS · NATS JetStream · EMQX · MapLibre GL JS · Zustand

---

## 1. Executive Overview

This document is the authoritative architectural reference for a high-concurrency Integrated Solid Waste Management (ISWM) platform tracking 2000+ GPS-equipped vehicles with sub-5ms end-to-end latency. The architecture is split into four distinct operational strata:

1. **Edge Ingestion** — Raw TCP/MQTT from GPS hardware
2. **Event Streaming** — NATS JetStream as the central nervous system
3. **Persistence** — TimescaleDB (telemetry) + PostgreSQL/PostGIS (relational)
4. **Client Delivery** — Go Fiber WebSocket hub → Next.js + MapLibre GL JS

All backend services are written in Go. No polyglot backend overhead. No Node.js on the critical path.

---

## 2. System Layers

### Layer 1 — Client Tier

| Client | Protocol | Notes |
|---|---|---|
| Dashboard web app (Next.js) | REST + WebSocket | Monitor, reports, alerts, live map |
| Mobile field app | REST | Driver/helper view, attendance, route nav — React Native or PWA |
| GPS devices (2000+) | Raw TCP/UDP → MQTT | IMEI identifies device; polling interval 10–30 sec |

### Layer 2 — API Gateway

| Component | Responsibility |
|---|---|
| **Traefik v3** (primary recommendation) | JWT validation (no DB hit per request), rate limiting, route to microservices, gzip + HTTP/2, CORS, automatic TLS, native Docker/K8s integration |
| **GPS Ingest Gateway (EMQX)** | Separate path — accepts raw device MQTT packets, decodes + validates, publishes to NATS. Never hits the main DB directly. |

> **Why Traefik over nginx/Kong?** Written in Go, zero-downtime deploys, faster dynamic routing, native Docker service discovery.

### Layer 3 — Microservices

All services are compiled Go binaries (~10 MB Docker images).

| Service | Priority | Packages | Responsibility |
|---|---|---|---|
| `gps-ingest` | 🔴 Real-time critical | `net`, `paho-mqtt-golang`, `go-redis` | Receive MQTT packets → decode → write to Redis (live position) + Redis Stream (queue) |
| `gps-writer` | 🔴 Real-time critical | `pgx`, `go-redis` | Consume Redis Stream → batch insert to TimescaleDB every 10s |
| `live-api` | 🔴 Real-time critical | `fiber`, `go-redis`, `gorilla/websocket` | REST: GET live position from Redis. WebSocket: subscribe to Redis pub/sub, push delta to dashboard clients |
| `alert-engine` | 🟡 Near real-time | `go-redis`, `pgx`, goroutines | Consume GPS stream → geofence checks, speed checks, stoppage detection → write alerts to Postgres |
| `monitor-api` | 🟡 Near real-time | `fiber`, `pgx`, `go-redis` | Vehicle statuses, route coverage, alert CRUD (snooze/close), shift management — reads Redis + Postgres |
| `master-api` | 🟢 Low frequency | `fiber`, `pgx` | Vehicles, routes, shifts, regions, employees, fuel stations — CRUD with long cache TTL |
| `report-worker` | 🔵 Background | `asynq`, `pgx`, `gofpdf`, `encoding/csv` | Consume report jobs → query TimescaleDB → generate PDF/CSV → upload to S3 |
| `auth-service` | ⚪ Session | `fiber`, `golang-jwt`, `pgx`, `go-redis` | Login, JWT issue (RS256), token refresh, permission matrix cache in Redis |
| `weighbridge-fuel-api` | 🟡 Transactional | `fiber`, `pgx` | Weighbridge in/out records, fuel transactions, POS device data |

### Layer 4 — Storage (Right Tool Per Job)

| Store | Use Case | Key Details |
|---|---|---|
| **Redis 7** | Live GPS cache | `vehicle:{id}:latest` JSON blob, TTL 2 min, <1ms reads. 2000 vehicles ≈ 4 MB RAM. GEO sorted sets, Pub/Sub for WebSocket fan-out |
| **TimescaleDB** | GPS history (time-series) | PostgreSQL + hypertables, billions of GPS rows, 10–100× faster than plain Postgres for time queries, compression after 7 days |
| **PostgreSQL 16 + PostGIS** | Master/relational data | Vehicles, routes, employees, regions, fuel, weighbridge. PostGIS for geofence polygon queries |
| **NATS JetStream** | Message queue | GPS ingest → services, alert triggers, report jobs. 820k msg/s, 3.2ms p99 latency, 15 MB binary |
| **S3 / Object Storage** | File storage | Pre-generated PDF reports, GeoJSON/KML route files, vehicle documents |
| **PgBouncer** | DB connection pooling | Transaction-mode: 1000 Go connections → 20 actual Postgres connections |

---

## 3. Full Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| All backend services | `Go 1.22+` | Fastest language for I/O + concurrency. Compiled, no VM, native goroutines. 2–5μs HTTP latency vs ~50μs Node.js |
| HTTP framework | `Fiber v3` | Uses fasthttp (~800k req/s). For CRUD services use `Chi` (stdlib-compatible, cleaner code) |
| GPS ingest | `Go + EMQX broker` | Go `net` package for raw TCP. EMQX (Erlang) handles 10M+ MQTT connections |
| WebSocket server | `gorilla/websocket` or `nhooyr.io/websocket` | 50k–100k concurrent connections per single Go process. Redis pub/sub fan-out |
| Live GPS cache | `Redis 7 (Redis Stack)` | <1ms reads. `go-redis` client with connection pooling. GEO sorted sets for spatial queries |
| GPS history DB | `TimescaleDB` | pgx driver (pure Go, fastest Postgres driver). Hypertable partitioning |
| Master data DB | `PostgreSQL 16 + PostGIS` | pgx driver. ST_Contains/ST_Intersects for geofence queries |
| Message queue | `NATS JetStream` | Purpose-built IoT messaging. Work-queue + interest retention policies |
| Report jobs | `asynq` (Redis-backed) | Redis-backed task queue. gofpdf for PDF, encoding/csv built-in |
| Frontend | `Next.js 14 (App Router)` | Server components for fast first paint. React for live dashboard |
| Map rendering | `MapLibre GL JS` | WebGL-rendered, handles 10k+ markers at 60fps with clustering |
| Frontend state | `Zustand + TanStack Query` | Zustand for WebSocket vehicle state (outside React tree). TanStack Query for REST with smart caching |
| API gateway | `Traefik v3` | Go binary, native Docker/K8s, automatic TLS, zero-downtime deploys |
| DB connection pool | `PgBouncer` | Transaction-mode pooling, critical at scale |
| Infra/deploy | `Docker + K8s` (or `Nomad` for small teams) | Scale GPS service independently. Go binaries = tiny ~10 MB images |

---

## 4. GPS Data Flow — Critical Path (Target: <5ms End-to-End)

```
GPS Device (MQTT/TCP)
        │
        ▼
EMQX Broker                     ← <1ms broker overhead
    Topic: gps/{imei}
        │
        ▼
gps-ingest service              ← Goroutine per device, <100μs decode
    Decode: lat, lng, speed, ignition, RFID fill-level
        │
        ├──────────────────────────────────────┐
        ▼                                      ▼
Redis (parallel pipeline)           (same pipeline)
  HSET vehicle:{id}:live             XADD Redis Stream (for gps-writer)
  PUBLISH gps:updates                PUBLISH gps:updates (for live-api)
  ← <1ms Redis pipeline →
        │
        ├─────────────────────┬─────────────────────┐
        ▼                     ▼                     ▼
  live-api               alert-engine           gps-writer
  (Step 4a)              (Step 4b)              (Step 4c)
  Redis pub/sub          Redis Stream           Redis Stream
  → WebSocket clients    → geofence/speed/      → batch 500 rows
  Delta only             stoppage checks        COPY to TimescaleDB
  <2ms to browser        → Postgres alerts      every 10 seconds
                         <5ms per check         (async, non-blocking)
```

---

## 5. WebSocket Hub Architecture

The WebSocket hub uses a concurrency-safe Hub pattern in Go:

- Each connected browser client = internal struct with connection pointer + sync mutex (prevents concurrent write panics)
- Background goroutine subscribes to NATS JetStream telemetry subjects
- **Batching strategy:** Instead of pushing 2000 individual JSON messages/sec (which locks the browser JS thread), the hub buffers updates over a **100ms temporal window**, then broadcasts a single compressed delta array
- Result: 10 smooth frames/sec to clients, drastically reduced network I/O

```go
// Conceptual Hub loop
ticker := time.NewTicker(100 * time.Millisecond)
for {
    select {
    case msg := <-natsMessages:
        buffer[msg.VehicleID] = msg  // Upsert latest position
    case <-ticker.C:
        if len(buffer) > 0 {
            broadcast(serializeDeltas(buffer))
            buffer = make(map[string]VehicleUpdate)
        }
    }
}
```

---

## 6. Frontend Architecture — Zero-Lag Rendering

### The React Reconciliation Problem & Solution

**Problem:** Pushing WebSocket telemetry into React Context/state triggers full virtual DOM reconciliation on every update. At 10 updates/sec with 2000 vehicles, this causes catastrophic UI lag.

**Solution — Zustand outside the React tree:**

```
WebSocket message arrives
        │
        ▼
Parse delta payload (JS)
        │
        ▼
Update Zustand store directly (NOT React state)
        │
        ├── React UI components (sidebar, charts, menus)
        │   Subscribe only to relevant slices → never re-render on GPS data
        │
        └── MapLibre GL JS
            Subscribes to Zustand imperatively (outside React lifecycle)
            Mutates GeoJSON source in-place → GPU vertex buffer update
            requestAnimationFrame loop → 60fps linear interpolation
            (prevents marker "teleporting" between 100ms updates)
```

### MapLibre GL JS Optimization Rules

1. **Single GeoJSON source** for all 2000 vehicles — never individual React marker components (DOM bloat + memory leaks)
2. **Mutate source in place** via `map.getSource('vehicles').setData(geojson)` — never remove/re-add layers
3. **requestAnimationFrame interpolation** — linearly interpolate lat/lng between updates at 60fps
4. **Abandon symbol layers for dynamic updates** — use circle layers or custom WebGL canvas overlay (symbol layers trigger heavy layout + collision recalculation)
5. **Minimum zoom threshold** — at low zoom, fall back to Supercluster.js clustering (insufficient pixels to distinguish 2000 trucks anyway)
6. **Vector tiles for static data** — ward boundaries, collection points served as compressed vector tiles (auto-simplify geometry by zoom level)
7. **Viewport optimization** — only render features visible in current viewport bounding box

---

## 7. Database Schemas

### 7a. TimescaleDB Hypertable — `gps_data`

```sql
CREATE TABLE gps_data (
    imei          VARCHAR(15)   NOT NULL,
    captured_at   TIMESTAMPTZ   NOT NULL,
    lat           FLOAT8        NOT NULL,
    lng           FLOAT8        NOT NULL,
    speed         SMALLINT      NOT NULL DEFAULT 0,
    ignition      SMALLINT      NOT NULL DEFAULT 0,  -- 0/1, NOT boolean (alignment)
    odometer      BIGINT        NOT NULL DEFAULT 0,
    hdop          FLOAT4,
    direction     SMALLINT,
    altitude      FLOAT4,
    satellites    SMALLINT,
    signal        SMALLINT,
    PRIMARY KEY (imei, captured_at)
);

SELECT create_hypertable('gps_data', 'captured_at',
    chunk_time_interval => INTERVAL '1 hour',
    partitioning_column => 'imei',
    number_partitions => 8
);

CREATE INDEX ON gps_data (imei, captured_at DESC);

-- Compress chunks older than 7 days
ALTER TABLE gps_data SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'captured_at DESC',
    timescaledb.compress_segmentby = 'imei'
);
SELECT add_compression_policy('gps_data', INTERVAL '7 days');

-- Retention: drop raw data after 90 days (aggregates kept indefinitely)
SELECT add_retention_policy('gps_data', INTERVAL '90 days');
```

**Why `SMALLINT` not `BOOLEAN` for flags:** PostgreSQL boolean (1 byte) causes alignment padding, bloating rows. SMALLINT (2 bytes) gives predictable even-byte alignment, eliminates padding waste, and is faster to serialize (numeric encoding vs string token parsing for true/false).

### Continuous Aggregates (Pre-computed Rollups)

```sql
-- Hourly summary per vehicle
CREATE MATERIALIZED VIEW vehicle_hourly_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', captured_at) AS bucket,
    imei,
    MAX(speed)                          AS max_speed,
    AVG(speed)                          AS avg_speed,
    COUNT(*)                            AS ping_count,
    MAX(odometer) - MIN(odometer)       AS distance_m
FROM gps_data
GROUP BY bucket, imei;

SELECT add_continuous_aggregate_policy('vehicle_hourly_summary',
    start_offset => INTERVAL '2 hours',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);
```

### 7b. PostgreSQL — Master Data Tables

```sql
-- Key pattern: TINYINT(1) for all boolean flags, indexed on every WHERE/JOIN column

CREATE TABLE vehicles (
    id                  SERIAL PRIMARY KEY,
    registration_no     VARCHAR(20) NOT NULL UNIQUE,
    chassis_no          VARCHAR(30),
    is_owned            SMALLINT    NOT NULL DEFAULT 1,   -- 0=hired, 1=owned
    is_active           SMALLINT    NOT NULL DEFAULT 1,
    vehicle_type_id     INT         NOT NULL,
    vehicle_make_id     INT,
    capacity_type_id    INT,
    contractor_id       INT
);
CREATE INDEX ON vehicles (is_active, vehicle_type_id);
CREATE INDEX ON vehicles USING gin (registration_no gin_trgm_ops); -- for LIKE search

CREATE TABLE vehicle_status_live (
    vehicle_id      INT         PRIMARY KEY,
    imei            VARCHAR(15) NOT NULL,
    status_code     SMALLINT    NOT NULL DEFAULT 0, -- 0=unknown,1=moving,2=idle,3=stopped,4=offline
    speed           SMALLINT    NOT NULL DEFAULT 0,
    ignition        SMALLINT    NOT NULL DEFAULT 0,
    lat             FLOAT8,
    lng             FLOAT8,
    last_seen_at    TIMESTAMPTZ,
    shift_id        INT,
    route_id        INT,
    parking_lot_id  INT
);
-- Primary store is Redis; this table is Postgres fallback
CREATE INDEX ON vehicle_status_live (status_code, shift_id);

CREATE TABLE routes (
    id                  SERIAL PRIMARY KEY,
    route_name          VARCHAR(100) NOT NULL,
    route_code          VARCHAR(20),
    estimated_distance  FLOAT4,
    route_type_id       SMALLINT,
    is_active           SMALLINT     NOT NULL DEFAULT 1,
    geofence_id         INT
);
CREATE INDEX ON routes (route_type_id, is_active);

CREATE TABLE regions (
    id              SERIAL PRIMARY KEY,
    region_name     VARCHAR(100) NOT NULL,
    region_code     VARCHAR(20),
    region_type_id  SMALLINT    NOT NULL, -- 1=zone, 2=ward, 3=block
    parent_id       INT,
    is_active       SMALLINT    NOT NULL DEFAULT 1,
    geofence_id     INT,
    geom            geometry(MultiPolygon, 4326)  -- PostGIS
);
CREATE INDEX ON regions (parent_id, region_type_id);
CREATE INDEX ON regions USING GIST (geom);

CREATE TABLE alerts (
    id              BIGSERIAL   PRIMARY KEY,
    alert_type_id   SMALLINT    NOT NULL,
    vehicle_id      INT         NOT NULL,
    imei            VARCHAR(15),
    status          SMALLINT    NOT NULL DEFAULT 0, -- 0=open, 1=snoozed, 2=closed
    time_reported   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    shift_id        INT,
    zone_id         INT,
    ward_id         INT,
    route_id        INT,
    alert_count     SMALLINT    NOT NULL DEFAULT 1,
    auto_closed_at  TIMESTAMPTZ
) PARTITION BY RANGE (time_reported);
CREATE INDEX ON alerts (status, alert_type_id, shift_id);
CREATE INDEX ON alerts (status, time_reported DESC);

CREATE TABLE employees (
    id                  SERIAL PRIMARY KEY,
    first_name          VARCHAR(50)  NOT NULL,
    last_name           VARCHAR(50)  NOT NULL,
    imc_employee_id     VARCHAR(20)  UNIQUE,
    phone_no            VARCHAR(15),
    designation_id      INT,
    dept_id             INT,
    is_active           SMALLINT     NOT NULL DEFAULT 1,
    aadhaar_hash        CHAR(64)     -- SHA-256, never store raw
);
CREATE INDEX ON employees (designation_id, is_active);

CREATE TABLE shifts (
    id          SERIAL PRIMARY KEY,
    shift_name  VARCHAR(50) NOT NULL,
    shift_code  CHAR(4)     NOT NULL UNIQUE,
    start_time  TIME        NOT NULL,
    end_time    TIME        NOT NULL,
    is_active   SMALLINT    NOT NULL DEFAULT 1
);
-- ~3 rows, fully cacheable

CREATE TABLE vehicle_shift_route (
    vehicle_id  INT         NOT NULL,
    shift_id    INT         NOT NULL,
    route_id    INT         NOT NULL,
    date        DATE        NOT NULL,
    driver_id   INT,
    helper_id   INT,
    is_temp     SMALLINT    NOT NULL DEFAULT 0,
    PRIMARY KEY (vehicle_id, shift_id, date)
);
CREATE INDEX ON vehicle_shift_route (date, shift_id);

CREATE TABLE fuel_transactions (
    id              BIGSERIAL   PRIMARY KEY,
    vehicle_id      INT         NOT NULL,
    fuel_station_id INT         NOT NULL,
    fuel_card_id    INT,
    quantity_l      DECIMAL(8,2),
    amount          DECIMAL(10,2),
    txn_start       TIMESTAMPTZ NOT NULL,
    txn_end         TIMESTAMPTZ,
    pos_device_id   INT
);
CREATE INDEX ON fuel_transactions (vehicle_id, txn_start);

CREATE TABLE weighbridge_records (
    id              BIGSERIAL   PRIMARY KEY,
    vehicle_id      INT         NOT NULL,
    ts_id           INT         NOT NULL, -- transfer station ID
    gross_wt        DECIMAL(8,3),
    tare_wt         DECIMAL(8,3),
    net_wt          DECIMAL(8,3),
    material_type   SMALLINT,
    rst_no          VARCHAR(20),
    in_time         TIMESTAMPTZ NOT NULL,
    out_time        TIMESTAMPTZ
);
CREATE INDEX ON weighbridge_records (ts_id, in_time, vehicle_id);

CREATE TABLE geofences (
    id              SERIAL PRIMARY KEY,
    geometry_json   JSONB,
    geometry_type   CHAR(10),   -- 'polygon', 'circle'
    is_geofence     SMALLINT    NOT NULL DEFAULT 1,
    border_color    CHAR(7),
    fill_color      CHAR(7),
    geom            geometry(MultiPolygon, 4326)
);
CREATE INDEX ON geofences USING GIST (geom);
```

---

## 8. API Endpoint Map

### 🔴 Real-Time APIs (WebSocket / SSE)

| Endpoint | Protocol | Source |
|---|---|---|
| `WS /live/vehicles` | WebSocket | Redis pub/sub fan-out, delta only |
| `WS /live/alerts` | WebSocket | New alert push |
| `GET /live/vehicle/:id` | REST | Redis read <1ms |
| `GET /live/dashboard-counts` | REST | Redis INCR counters |

### 🟡 Monitor APIs (Near Real-Time, 5s Cache)

| Endpoint | Source |
|---|---|
| `GET /monitor/vehicles` | Redis + Postgres join |
| `GET /monitor/alerts` | Postgres (indexed) |
| `POST /monitor/alert/:id/snooze` | Postgres write |
| `GET /monitor/route-coverage` | TimescaleDB continuous aggregate |

### 🟢 Master Data APIs (Long Cache, 5–60 min TTL)

| Endpoint | Notes |
|---|---|
| `GET /master/vehicles` | Paginated (cursor-based, 50/page), filterable |
| `GET /master/routes` | With geometry optional (lazy-loaded GeoJSON) |
| `GET /master/regions` | Tree by type (zone/ward/block) |
| `GET /master/shifts` | Fully static-cacheable (~3 rows) |
| `GET /master/fuel-stations` | With zone filter |
| `GET /master/employees` | Paginated |

### 🔵 Report APIs (Async Job Queue)

| Endpoint | Pattern |
|---|---|
| `POST /reports/generate` | Enqueue asynq job → return `job_id` immediately |
| `GET /reports/status/:job_id` | Poll job status (queued/running/done/failed) |
| `GET /reports/download/:job_id` | Return S3 pre-signed URL |

---

## 9. NATS JetStream Configuration

### Subject Topology

```
telemetry.vehicle.{zone_id}.{vehicle_id}   ← GPS pings
alerts.trigger.{alert_type}                ← Alert events
reports.job.{job_type}                     ← Report queue
```

### Stream Retention Policies

| Stream | Retention Policy | Reason |
|---|---|---|
| GPS telemetry (for DB writer) | **WorkQueue** — delete on ack | DB worker confirms insert, message removed |
| GPS telemetry (for WebSocket hub) | **Interest** — keep while subscribers active | Auto-purges when no dashboard connected |
| Alert triggers | **Limits** — 24h max age | Bounded backlog |
| Report jobs | **WorkQueue** | Exactly-once delivery to worker |

### Broker Comparison

| Metric | NATS JetStream | Redis Streams | Apache Kafka |
|---|---|---|---|
| p99 Latency | 3.2ms | 0.8ms | 12.5ms |
| Producer Throughput | 820k msg/s | 480k msg/s | 1.2M msg/s |
| Storage | File-backed (disk+memory hybrid) | Memory-bound | Disk-backed |
| Operational Overhead | <20MB binary | Moderate | High (JVM tuning) |
| Best For | IoT microservice routing | Caching + ephemeral data | Heavy data pipelines |

**Verdict:** NATS JetStream for this use case. Redis Streams acceptable if already in stack and message volume stays below Redis memory budget.

---

## 10. In-Memory Geofencing (Go)

Point-in-polygon checks for 2000 vehicles/second must be CPU-bound in Go, not database queries:

```go
// Pre-load all ward/zone polygons into memory at startup
// Use go-geofence or tile-based spatial index for nanosecond lookups
// Only write to Postgres when a vehicle ENTERS or EXITS a geofence (event-driven)
// Never do ST_Contains per GPS ping — that's a DB killer
```

- Pre-compute bounding boxes of all municipal polygons at startup
- Use tiled spatial cache for O(1) bounding-box pre-filter
- Full point-in-polygon only on candidates that pass bounding-box check
- Result: <1μs per geofence check in Go vs milliseconds in Postgres

---

## 11. Performance Optimization Rules

### GPS at Scale (2000+ Devices)

- **Never query DB per GPS ping** — Redis only for live positions
- Batch write GPS to TimescaleDB every 10s via gps-writer (500 rows per COPY command)
- WebSocket: send only **changed vehicles** (delta, not full state of 2000 vehicles)
- Map clusters client-side (Supercluster.js) at low zoom levels
- Redis GEO commands (`GEORADIUS`) for nearest-vehicle spatial queries

### Dashboard Load Speed

- Dashboard counts from Redis counters (`INCR`/`DECR`) — never `COUNT(*)` queries
- First load: HTTP/2 multiplex all master data requests in parallel
- Cache headers: `Cache-Control: stale-while-revalidate` for list endpoints
- Paginate vehicles: 50 per page, cursor-based (not `OFFSET`)
- Geometry (GeoJSON) lazy-loaded separately — not bundled with list responses

### Database Query Rules

- Never `SELECT *` — always name columns explicitly
- Filter by zone/ward: `region_type_id` index + `parent_id` tree walk
- Vehicle search: `pg_trgm` GIN index on `registration_no` for LIKE queries
- Alert sort: composite index `(status, time_reported DESC)`
- Full text search: only for employee name search via `pg_trgm`
- Historical queries: always hit TimescaleDB continuous aggregates, not raw hypertable

### Serialization

- Do NOT use Go's `encoding/json` (reflection overhead) for hot paths
- Use `sonic` or `easyjson` (generated serializers, bypass reflection entirely)
- Integer flags (0/1) serialize faster than boolean tokens (true/false string parsing)

---

## 12. RFID + Smart Bin Integration

GPS devices carry an onboard RFID reader. As collection vehicles approach bins:

1. RFID tag on bin is scanned → unique bin hardware hash captured
2. Ultrasonic fill-level sensor reading multiplexed into the GPS payload
3. gps-ingest decodes both GPS coordinates AND bin fill-level in the same packet
4. When fill indicator flips `0 → 1` (empty → full): immediate Postgres update to bin asset table
5. Routing engine queries all `fill_status = 1` bins, runs vehicle routing problem (VRP) algorithm
6. Optimal minimum-distance collection path generated dynamically

**Impact:** Studies show demand-driven routing (vs static routes) reduces unnecessary mileage and cuts greenhouse gas emissions by ~20%.

---

## 13. Go Service Performance Benchmarks

| Metric | Value | Comparison |
|---|---|---|
| Go HTTP latency | 2–5μs | vs ~50μs Node.js |
| WebSocket connections | 100k+ per process | Single Go binary |
| Goroutine memory | ~2KB initial stack | 2000 GPS connections = ~4MB RAM |
| GC pause | <1ms | Predictable, no spikes |
| Docker image size | ~10MB | No runtime dependencies |
| Fiber throughput | ~800k req/s | Uses fasthttp engine |

---

## 14. Deployment Architecture

```
                    ┌─────────────────────────────────────┐
                    │           Traefik v3 Gateway         │
                    │  TLS termination, JWT auth, routing  │
                    └────────────┬────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                      ▼
    ┌──────────┐          ┌──────────┐          ┌──────────┐
    │ live-api │          │monitor-  │          │master-   │
    │(WebSocket│          │  api     │          │  api     │
    │ + REST)  │          │          │          │          │
    └──────────┘          └──────────┘          └──────────┘
          │
          ▼
    ┌──────────┐          ┌──────────┐          ┌──────────┐
    │gps-ingest│          │alert-    │          │report-   │
    │          │          │ engine   │          │ worker   │
    └──────────┘          └──────────┘          └──────────┘
          │                      │                    │
          ▼                      ▼                    ▼
    ┌─────────────────────────────────────────────────────┐
    │                  NATS JetStream                      │
    └───────────┬─────────────────────────────────────────┘
                │
    ┌───────────┼──────────────────────┐
    ▼           ▼                      ▼
 Redis 7   TimescaleDB         PostgreSQL 16 + PostGIS
(live GPS) (GPS history)       (master data)
                │
           PgBouncer
         (connection pool)
```

### Scaling Strategy

- **gps-ingest** and **gps-writer**: scale horizontally — add replicas as device count grows
- **live-api**: scale horizontally — Redis pub/sub fan-out works across multiple instances
- **report-worker**: scale independently — background jobs, no latency requirements
- **alert-engine**: single instance or active-passive (avoid duplicate alert writes)
- All Go binaries stateless → K8s HPA based on CPU/goroutine count

---

## 15. Security Checklist

- JWT (RS256) validated at Traefik gateway — no DB hit per request
- Permission matrix cached in Redis per user session
- GPS device authentication via IMEI allowlist in EMQX
- Never store raw Aadhaar — store SHA-256 hash only
- S3 report URLs are pre-signed with 15-minute expiry
- PgBouncer in transaction mode — no session-level leaks between tenants
- All inter-service communication internal to cluster (never public internet)

---

*This architecture handles production systems with 50,000+ GPS devices. At 2000 devices, all components run comfortably on 3–4 servers or a small K8s cluster.*
