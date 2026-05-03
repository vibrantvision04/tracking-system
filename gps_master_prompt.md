# 🛰️ GPS Vehicle Tracking System — Master Prompt & Full Architecture

> **Production-grade** | Golang + PostgreSQL (TimescaleDB) + Redis + Leaflet.js  
> Designed for **10,000+ vehicles**, millions of GPS points/day  
> Author: Architecture Reference Document  
> Version: 1.0.0

---

## 📋 TABLE OF CONTENTS

1. [Master Prompt for AI/IDE](#master-prompt)
2. [Full Project Structure](#project-structure)
3. [Creation Map (Build Order)](#creation-map)
4. [Database Schema](#database-schema)
5. [Data Flow Pipeline](#data-flow-pipeline)
6. [Storage Layer Strategy](#storage-layers)
7. [Performance Rules](#performance-rules)
8. [API Endpoints Reference](#api-reference)
9. [Frontend Architecture](#frontend)
10. [Deployment Guide](#deployment)

---

## 1. 🧠 MASTER PROMPT FOR AI/IDE {#master-prompt}

> Copy this entire block into your AI IDE (Cursor, Windsurf, GitHub Copilot Workspace, etc.)

```
Build a production-grade GPS vehicle tracking system using the following stack:

STACK:
- Backend: Golang (Go 1.22+)
- Database: PostgreSQL 15 with TimescaleDB extension
- Cache/Queue: Redis 7 (Streams + key-value)
- Frontend: Leaflet.js + Vanilla JS (or React optional)
- Message Queue: Redis Streams (or NATS as alternative)
- Export: gofpdf (PDF), encoding/csv (CSV)
- Auth: JWT (golang-jwt/jwt)
- Transport: TCP (GPS devices), HTTP REST (frontend), WebSocket (live tracking)

PERFORMANCE IS THE HIGHEST PRIORITY. The system must support:
- 10,000+ simultaneous GPS devices
- 1M+ GPS points per day per deployment
- Sub-100ms response for live tracking
- Sub-500ms response for movement reports

==============================================================
SECTION 1: GPS INGESTION (TCP SERVER)
==============================================================

Create a TCP server in Go that:
- Listens on port 5027 (configurable via ENV)
- Accepts connections from Teltonika GPS devices
- Reads binary AVL packets (Codec8 and Codec8E protocol)
- Decodes: IMEI (15 digits), latitude, longitude, speed (km/h),
  heading (degrees), ignition state (IO element 239), altitude,
  satellites, HDOP, and all IO elements as JSON
- Does NOT write directly to PostgreSQL
- Pushes decoded data to Redis Stream: "gps:stream"
- Sends TCP acknowledgment (4-byte big-endian count of records)
- Handles connection drops gracefully with reconnect logic
- Supports 10,000+ concurrent connections via goroutine pool

Decoder must handle:
- Codec8 (1-byte IO IDs)
- Codec8E (2-byte IO IDs)
- CRC16 validation
- Multiple AVL records per packet (batch)

==============================================================
SECTION 2: WORKER / DATA PIPELINE
==============================================================

Create a worker service that:
- Reads from Redis Stream "gps:stream" using consumer group
- Worker pool size: configurable (default 10 workers)
- For each GPS point:
  1. Validate data (lat/lng bounds, reasonable speed < 300 km/h)
  2. Batch collect 500 rows, then bulk insert into TimescaleDB
  3. Update Redis key "gps:latest:{imei}" with latest location JSON
  4. Check all active geofences — publish enter/exit events
  5. Detect trip start/end (ignition ON/OFF logic)
  6. Broadcast via WebSocket to subscribed clients
- Batch insert interval: max 2 seconds OR 500 rows (whichever first)
- Use pgx v5 bulk copy protocol for fastest inserts
- Acknowledge Redis Stream only after successful DB write

==============================================================
SECTION 3: DATABASE SCHEMA (TimescaleDB)
==============================================================

Create the following tables with exact SQL:

TABLE: gps_data (TimescaleDB hypertable)
- imei TEXT NOT NULL
- time TIMESTAMPTZ NOT NULL
- lat DOUBLE PRECISION NOT NULL
- lng DOUBLE PRECISION NOT NULL
- speed FLOAT
- heading INT
- altitude FLOAT
- satellites INT
- ignition BOOLEAN
- io JSONB
- INDEX on (imei, time DESC)
- Partition by 1 week chunks
- Retention policy: 90 days raw data

TABLE: vehicles
- id SERIAL PRIMARY KEY
- name TEXT NOT NULL
- plate_number TEXT UNIQUE NOT NULL
- vehicle_type TEXT (car/truck/bus/motorcycle)
- owner_id INT REFERENCES users(id)
- created_at TIMESTAMPTZ DEFAULT NOW()

TABLE: gps_devices
- id SERIAL PRIMARY KEY
- imei TEXT UNIQUE NOT NULL
- model TEXT
- firmware_version TEXT
- sim_number TEXT
- status TEXT (active/inactive/maintenance)

TABLE: vehicle_gps_map
- vehicle_id INT REFERENCES vehicles(id)
- device_id INT REFERENCES gps_devices(id)
- assigned_at TIMESTAMPTZ
- unassigned_at TIMESTAMPTZ
- PRIMARY KEY (vehicle_id, device_id, assigned_at)

TABLE: trips
- id SERIAL PRIMARY KEY
- vehicle_id INT REFERENCES vehicles(id)
- imei TEXT NOT NULL
- start_time TIMESTAMPTZ NOT NULL
- end_time TIMESTAMPTZ
- distance FLOAT DEFAULT 0
- max_speed FLOAT DEFAULT 0
- avg_speed FLOAT DEFAULT 0
- start_lat DOUBLE PRECISION
- start_lng DOUBLE PRECISION
- end_lat DOUBLE PRECISION
- end_lng DOUBLE PRECISION
- path JSONB  -- downsampled polyline [{lat,lng,t}]
- INDEX on (vehicle_id, start_time DESC)

TABLE: movement_reports
- id SERIAL PRIMARY KEY
- vehicle_id INT REFERENCES vehicles(id)
- report_date DATE NOT NULL
- total_distance FLOAT DEFAULT 0
- avg_speed FLOAT DEFAULT 0
- max_speed FLOAT DEFAULT 0
- start_time TIMESTAMPTZ
- end_time TIMESTAMPTZ
- ignition_on_duration INT DEFAULT 0  -- seconds
- idle_duration INT DEFAULT 0         -- seconds (ignition ON, speed < 5)
- stoppage_duration INT DEFAULT 0     -- seconds (ignition OFF)
- total_trips INT DEFAULT 0
- start_lat DOUBLE PRECISION
- start_lng DOUBLE PRECISION
- end_lat DOUBLE PRECISION
- end_lng DOUBLE PRECISION
- UNIQUE(vehicle_id, report_date)

TABLE: geofences
- id SERIAL PRIMARY KEY
- name TEXT NOT NULL
- type TEXT NOT NULL  -- circle / polygon / ward / zone
- polygon JSONB NOT NULL  -- GeoJSON format
- color TEXT DEFAULT '#FF0000'
- owner_id INT REFERENCES users(id)
- created_at TIMESTAMPTZ DEFAULT NOW()

TABLE: geofence_events
- id SERIAL PRIMARY KEY
- vehicle_id INT REFERENCES vehicles(id)
- geofence_id INT REFERENCES geofences(id)
- event_type TEXT NOT NULL  -- enter / exit
- time TIMESTAMPTZ NOT NULL
- lat DOUBLE PRECISION
- lng DOUBLE PRECISION

TABLE: users
- id SERIAL PRIMARY KEY
- email TEXT UNIQUE NOT NULL
- password_hash TEXT NOT NULL
- role TEXT NOT NULL  -- admin/manager/viewer
- created_at TIMESTAMPTZ DEFAULT NOW()

==============================================================
SECTION 4: REDIS DATA STRUCTURES
==============================================================

Use Redis for:

1. Latest location cache:
   Key: "gps:latest:{imei}"
   Value: JSON { lat, lng, speed, heading, ignition, time, satellites }
   TTL: 3600 seconds (1 hour)
   Command: SET gps:latest:{imei} {json} EX 3600

2. GPS ingestion stream:
   Key: "gps:stream"
   Type: Redis Stream
   Consumer group: "workers"
   Retention: MAXLEN ~= 100000 entries

3. Online vehicles set:
   Key: "gps:online"
   Type: Redis Set
   Members: IMEIs of vehicles seen in last 5 minutes

4. WebSocket subscriptions:
   Key: "ws:subs:{client_id}"
   Value: list of IMEIs this client is watching

5. Report cache:
   Key: "report:movement:{vehicle_id}:{date}"
   Value: JSON of movement report
   TTL: 86400 seconds

==============================================================
SECTION 5: LIVE TRACKING (WEBSOCKET)
==============================================================

Create a WebSocket server that:
- Endpoint: /ws/track
- Authentication: JWT token in query param ?token=
- Client subscribes to one or more IMEIs via message:
  { "action": "subscribe", "imeis": ["123456789", ...] }
- Server pushes updates:
  { "imei": "123456789", "lat": 26.9, "lng": 75.8,
    "speed": 45, "heading": 180, "ignition": true,
    "time": "2025-01-01T10:00:00Z" }
- Use gorilla/websocket
- Use Redis pub/sub per-IMEI channel for fan-out
- Handle disconnect cleanup

==============================================================
SECTION 6: PLAYBACK SYSTEM
==============================================================

Create playback API:

GET /api/v1/vehicles/{id}/playback
Query params: from (ISO datetime), to (ISO datetime), sample_interval (seconds, default 10)

Logic:
1. Validate time range (max 24 hours per request)
2. Query gps_data WHERE imei = $1 AND time BETWEEN $2 AND $3 ORDER BY time
3. Apply sampling: keep every Nth point to maintain ~2000 points max
4. Return: { points: [{lat, lng, speed, heading, time, ignition}], total: N }

Also:
GET /api/v1/trips/{trip_id}/playback — uses pre-stored path JSON (faster)

==============================================================
SECTION 7: MOVEMENT REPORT ENGINE
==============================================================

Create a scheduled job (cron, runs daily at 00:05 AM):

For each vehicle with GPS data in the past day:
1. Fetch all gps_data for that vehicle's IMEI for the date
2. Calculate:
   - total_distance: Sum of Haversine distances between consecutive points
   - avg_speed: Average of non-zero speed readings
   - max_speed: Maximum speed reading
   - ignition_on_duration: Total seconds where ignition = true
   - idle_duration: Seconds where ignition = true AND speed < 5 km/h
   - stoppage_duration: Seconds where ignition = false
   - total_trips: Count of trip records for that date
   - start coordinates: First GPS point of day
   - end coordinates: Last GPS point of day
3. Upsert into movement_reports table
4. Cache in Redis: "report:movement:{vehicle_id}:{date}" for 24h
5. Also generate trip segments:
   - Trip starts: ignition OFF→ON
   - Trip ends: ignition ON→OFF (or 5 min no data)
   - Save each trip to trips table with downsampled path

Haversine formula must be accurate to 10 meters.

==============================================================
SECTION 8: EXPORT SYSTEM
==============================================================

Endpoints:
  GET /api/v1/report/export?vehicle_id=&date=&format=csv
  GET /api/v1/report/export?vehicle_id=&date=&format=pdf
  GET /api/v1/report/export?vehicle_id=&from=&to=&format=csv  (range)

CSV Export:
- Columns: Time, Latitude, Longitude, Speed (km/h), Heading,
  Ignition, Satellites, Address (optional reverse geocode)
- Stream response (don't buffer entire file in memory)
- filename: vehicle_{id}_{date}.csv

PDF Export using gofpdf:
- Page: A4 Portrait
- Header: Company logo + vehicle name + date range + plate number
- Summary table: Total Distance, Avg Speed, Max Speed, Driving Time,
  Idle Time, Stoppage Time, Total Trips
- Detail table: Time | Location | Speed | Status (max 500 rows per page)
- Footer: Page X of Y + generation timestamp
- filename: vehicle_{id}_{date}_report.pdf

==============================================================
SECTION 9: GEOFENCING ENGINE
==============================================================

Implement geofence checking using Ray Casting algorithm:

func pointInPolygon(point [2]float64, polygon [][2]float64) bool

On every GPS data point processed by worker:
1. Load active geofences from cache (Redis, refresh every 60s)
2. For each geofence, check if current point is inside
3. Compare with previous state (was vehicle inside or outside?)
4. If state changed: INSERT into geofence_events, publish alert

API:
  POST /api/v1/geofences          — create geofence
  GET  /api/v1/geofences          — list all geofences
  PUT  /api/v1/geofences/{id}     — update geofence
  DELETE /api/v1/geofences/{id}   — delete geofence
  GET  /api/v1/geofences/{id}/events?from=&to= — get events

==============================================================
SECTION 10: REST API STRUCTURE
==============================================================

Base: /api/v1
Auth: Bearer JWT in Authorization header

VEHICLES:
  GET    /vehicles              — list (paginated, filter by zone/ward)
  POST   /vehicles              — create
  GET    /vehicles/{id}         — get single
  PUT    /vehicles/{id}         — update
  DELETE /vehicles/{id}         — soft delete
  GET    /vehicles/{id}/latest  — latest location from Redis
  GET    /vehicles/{id}/status  — online/offline status

GPS DEVICES:
  GET    /devices               — list
  POST   /devices               — register new device
  PUT    /devices/{id}/assign   — assign to vehicle
  DELETE /devices/{id}/unassign — remove from vehicle

REPORTS:
  GET    /reports/movement?vehicle_id=&date=
  GET    /reports/movement?vehicle_id=&from=&to=
  GET    /reports/trips?vehicle_id=&date=
  GET    /report/export?vehicle_id=&date=&format=csv|pdf

PLAYBACK:
  GET    /vehicles/{id}/playback?from=&to=&sample=10
  GET    /trips/{id}/playback

LIVE:
  GET    /vehicles/live         — all latest locations (from Redis)
  WebSocket: /ws/track?token=

AUTH:
  POST   /auth/login
  POST   /auth/refresh
  POST   /auth/logout

DASHBOARD:
  GET    /dashboard/stats       — total vehicles, online count, alerts today
  GET    /dashboard/alerts      — recent geofence events

==============================================================
SECTION 11: FRONTEND (LEAFLET.JS)
==============================================================

Create a single-page application with:

PAGES:
1. Live Tracking Map
   - Full-screen Leaflet map (OpenStreetMap tiles)
   - Marker cluster for all vehicles
   - Click vehicle: show popup with speed/ignition/last seen
   - Real-time marker updates via WebSocket
   - Vehicle list sidebar (filter by zone, ward, status)
   - Toggle satellite/street view

2. Playback Page
   - Date-time range picker
   - Vehicle selector
   - Play/Pause/Speed control (1x, 2x, 5x, 10x)
   - Progress slider (scrub through route)
   - Animated marker moving along polyline
   - Speed graph below map (Chart.js)

3. Movement Reports Page
   - Date picker
   - Vehicle selector (or all vehicles)
   - Summary cards: distance, speed, idle time
   - Data table with sorting
   - Export CSV / Export PDF buttons

4. Geofence Manager
   - Draw polygon on map (leaflet-draw plugin)
   - Name the geofence
   - View geofence events timeline
   - Zone/Ward assignment

PLUGINS TO INCLUDE:
  - leaflet.js 1.9+
  - leaflet-draw (geofence drawing)
  - leaflet-markercluster (performance with many vehicles)
  - Chart.js (speed graphs)
  - flatpickr (datetime picker)

==============================================================
SECTION 12: PROJECT STRUCTURE
==============================================================

Use clean architecture. See full structure below in this document.

==============================================================
SECTION 13: CONFIGURATION
==============================================================

Use environment variables with .env file support (godotenv):

GPS_TCP_PORT=5027
HTTP_PORT=8080
WS_PORT=8081
DB_DSN=postgres://gps:password@localhost:5432/gpsdb
REDIS_ADDR=localhost:6379
REDIS_PASSWORD=
JWT_SECRET=your-super-secret-key-here
WORKER_POOL_SIZE=10
BATCH_SIZE=500
BATCH_TIMEOUT_MS=2000
LOG_LEVEL=info
REPORT_CRON="5 0 * * *"
MAX_PLAYBACK_HOURS=24
MAX_PLAYBACK_POINTS=5000

==============================================================
SECTION 14: ERROR HANDLING & LOGGING
==============================================================

- Use structured logging (zerolog or zap)
- Log every GPS decode error with imei + raw bytes
- Log every DB insert error with batch size
- Metrics endpoint: GET /metrics (Prometheus format)
- Health check: GET /health

==============================================================
OUTPUT REQUIRED FROM AI:
==============================================================

Generate ALL of the following files completely:

1. cmd/server/main.go
2. internal/tcp/server.go
3. internal/decoder/codec8.go
4. internal/decoder/codec8e.go
5. internal/worker/pipeline.go
6. internal/repository/gps_repo.go
7. internal/repository/vehicle_repo.go
8. internal/repository/report_repo.go
9. internal/service/report_service.go
10. internal/service/geofence_service.go
11. internal/service/trip_service.go
12. internal/ws/hub.go
13. internal/ws/client.go
14. internal/api/handlers.go
15. internal/api/router.go
16. internal/api/middleware.go
17. internal/geofence/engine.go
18. internal/cache/redis.go
19. internal/export/csv_exporter.go
20. internal/export/pdf_exporter.go
21. internal/cron/report_job.go
22. internal/auth/jwt.go
23. migrations/001_initial.sql
24. migrations/002_timescale.sql
25. migrations/003_indexes.sql
26. frontend/index.html
27. frontend/tracking.js
28. frontend/playback.js
29. frontend/reports.js
30. docker-compose.yml
31. Dockerfile
32. .env.example
33. go.mod
```

---

## 2. 📁 FULL PROJECT STRUCTURE {#project-structure}

```
gps-tracking-system/
│
├── cmd/
│   └── server/
│       └── main.go                    # Entry point — starts all services
│
├── internal/
│   ├── tcp/
│   │   ├── server.go                  # TCP listener (port 5027)
│   │   ├── connection.go              # Per-connection handler goroutine
│   │   └── pool.go                    # Connection pool manager
│   │
│   ├── decoder/
│   │   ├── codec8.go                  # Teltonika Codec8 binary decoder
│   │   ├── codec8e.go                 # Teltonika Codec8E decoder
│   │   ├── crc16.go                   # CRC16 checksum validation
│   │   └── models.go                  # AVLData, GPSElement structs
│   │
│   ├── worker/
│   │   ├── pipeline.go                # Redis Stream consumer + worker pool
│   │   ├── batch_writer.go            # Batched DB insert logic
│   │   └── dispatcher.go              # Fan-out: DB + Redis + WS + Geofence
│   │
│   ├── repository/
│   │   ├── db.go                      # pgx connection pool setup
│   │   ├── gps_repo.go                # gps_data bulk insert + queries
│   │   ├── vehicle_repo.go            # CRUD for vehicles + devices
│   │   ├── trip_repo.go               # Trip insert + fetch
│   │   ├── report_repo.go             # Movement report upsert + fetch
│   │   └── geofence_repo.go           # Geofence CRUD + event insert
│   │
│   ├── service/
│   │   ├── report_service.go          # Movement report calculation logic
│   │   ├── trip_service.go            # Trip detection (ignition events)
│   │   ├── geofence_service.go        # Geofence check + alert publish
│   │   └── vehicle_service.go         # Business logic for vehicles
│   │
│   ├── api/
│   │   ├── router.go                  # HTTP router (chi or gin)
│   │   ├── handlers.go                # All HTTP handlers
│   │   ├── middleware.go              # JWT auth, rate limit, CORS, logging
│   │   └── response.go                # Standard JSON response helpers
│   │
│   ├── ws/
│   │   ├── hub.go                     # WebSocket hub (manages all clients)
│   │   ├── client.go                  # Per-client WS connection handler
│   │   └── subscriber.go              # Redis pub/sub bridge → WS broadcast
│   │
│   ├── geofence/
│   │   ├── engine.go                  # Ray casting point-in-polygon
│   │   ├── cache.go                   # In-memory geofence list (60s refresh)
│   │   └── checker.go                 # Per-point geofence evaluation
│   │
│   ├── cache/
│   │   ├── redis.go                   # Redis client setup + helpers
│   │   ├── location.go                # Latest location get/set
│   │   └── report_cache.go            # Report caching
│   │
│   ├── export/
│   │   ├── csv_exporter.go            # Streaming CSV generation
│   │   └── pdf_exporter.go            # PDF report using gofpdf
│   │
│   ├── cron/
│   │   ├── scheduler.go               # Cron job scheduler setup
│   │   └── report_job.go              # Nightly movement report generator
│   │
│   ├── auth/
│   │   ├── jwt.go                     # JWT generate + validate
│   │   └── middleware.go              # Auth middleware
│   │
│   └── config/
│       └── config.go                  # ENV config loader
│
├── migrations/
│   ├── 001_initial_schema.sql         # Core tables (users, vehicles, devices)
│   ├── 002_timescale_setup.sql        # gps_data hypertable + retention
│   ├── 003_trips_reports.sql          # trips, movement_reports
│   ├── 004_geofences.sql              # geofences, geofence_events
│   └── 005_indexes.sql                # All performance indexes
│
├── frontend/
│   ├── index.html                     # Main HTML shell
│   ├── css/
│   │   └── app.css                    # Styles
│   ├── js/
│   │   ├── app.js                     # App init + routing
│   │   ├── tracking.js                # Live tracking map + WebSocket
│   │   ├── playback.js                # Route playback + animation
│   │   ├── reports.js                 # Movement reports table + charts
│   │   ├── geofence.js                # Geofence draw + manage
│   │   ├── api.js                     # API client (fetch wrapper)
│   │   └── auth.js                    # Login + JWT storage
│   └── assets/
│       └── marker-icons/              # Custom vehicle marker SVGs
│
├── scripts/
│   ├── setup_db.sh                    # DB init + TimescaleDB setup
│   ├── seed_data.go                   # Test data generator
│   └── load_test.go                   # TCP load test (simulate 1000 devices)
│
├── docker/
│   ├── Dockerfile                     # Multi-stage Go build
│   ├── docker-compose.yml             # Full stack (Go + PG + Redis + pgAdmin)
│   └── postgres/
│       └── init.sql                   # DB init for Docker
│
├── docs/
│   ├── API.md                         # Complete API documentation
│   ├── DECODER.md                     # Codec8 decoder explanation
│   └── PERFORMANCE.md                 # Benchmarks + tuning guide
│
├── go.mod
├── go.sum
├── .env.example
├── .gitignore
└── README.md
```

---

## 3. 🗺️ CREATION MAP (BUILD ORDER) {#creation-map}

Build in this exact sequence to avoid dependency issues:

```
PHASE 1 — FOUNDATION (Day 1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [1]  go.mod                           — module + dependencies
 [2]  internal/config/config.go        — ENV loader first (everything needs it)
 [3]  migrations/001_initial_schema.sql
 [4]  migrations/002_timescale_setup.sql
 [5]  migrations/003_trips_reports.sql
 [6]  migrations/004_geofences.sql
 [7]  migrations/005_indexes.sql
 [8]  scripts/setup_db.sh              — run migrations

PHASE 2 — DATA LAYER (Day 1-2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [9]  internal/repository/db.go        — pgx pool
 [10] internal/cache/redis.go          — Redis client
 [11] internal/decoder/models.go       — shared data structs
 [12] internal/decoder/crc16.go        — CRC validation
 [13] internal/decoder/codec8.go       — Codec8 decoder
 [14] internal/decoder/codec8e.go      — Codec8E decoder
 [15] internal/repository/gps_repo.go  — GPS data inserts
 [16] internal/repository/vehicle_repo.go
 [17] internal/repository/trip_repo.go
 [18] internal/repository/report_repo.go
 [19] internal/repository/geofence_repo.go
 [20] internal/cache/location.go
 [21] internal/cache/report_cache.go

PHASE 3 — INGESTION PIPELINE (Day 2-3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [22] internal/tcp/server.go           — TCP listener
 [23] internal/tcp/connection.go       — per-device handler
 [24] internal/tcp/pool.go             — connection pool
 [25] internal/worker/batch_writer.go  — batched inserts
 [26] internal/worker/pipeline.go      — Redis Stream consumer
 [27] internal/worker/dispatcher.go    — fan-out logic

PHASE 4 — BUSINESS LOGIC (Day 3-4)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [28] internal/geofence/engine.go      — point-in-polygon
 [29] internal/geofence/cache.go       — geofence list cache
 [30] internal/geofence/checker.go     — per-point evaluator
 [31] internal/service/geofence_service.go
 [32] internal/service/trip_service.go — ignition-based detection
 [33] internal/service/report_service.go — Haversine + calculations
 [34] internal/service/vehicle_service.go

PHASE 5 — API + AUTH + WS (Day 4-5)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [35] internal/auth/jwt.go
 [36] internal/auth/middleware.go
 [37] internal/ws/hub.go
 [38] internal/ws/client.go
 [39] internal/ws/subscriber.go
 [40] internal/api/response.go
 [41] internal/api/middleware.go
 [42] internal/api/handlers.go
 [43] internal/api/router.go

PHASE 6 — EXPORT + CRON (Day 5)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [44] internal/export/csv_exporter.go
 [45] internal/export/pdf_exporter.go
 [46] internal/cron/report_job.go
 [47] internal/cron/scheduler.go

PHASE 7 — ENTRY POINT (Day 5-6)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [48] cmd/server/main.go               — wire everything together

PHASE 8 — FRONTEND (Day 6-8)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [49] frontend/index.html
 [50] frontend/js/api.js
 [51] frontend/js/auth.js
 [52] frontend/js/tracking.js          — live map + WebSocket
 [53] frontend/js/playback.js
 [54] frontend/js/reports.js
 [55] frontend/js/geofence.js
 [56] frontend/js/app.js
 [57] frontend/css/app.css

PHASE 9 — DOCKER + DOCS (Day 8)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [58] docker/Dockerfile
 [59] docker/docker-compose.yml
 [60] docs/API.md
 [61] README.md
```

---

## 4. 🗄️ DATABASE SCHEMA {#database-schema}

### TimescaleDB Hypertable Setup
```sql
-- Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Raw GPS data
CREATE TABLE gps_data (
    imei        TEXT NOT NULL,
    time        TIMESTAMPTZ NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    speed       FLOAT,
    heading     INT,
    altitude    FLOAT,
    satellites  INT,
    ignition    BOOLEAN DEFAULT false,
    io          JSONB
);

-- Convert to hypertable (partitioned by week)
SELECT create_hypertable('gps_data', 'time', chunk_time_interval => INTERVAL '1 week');

-- Indexes
CREATE INDEX ON gps_data (imei, time DESC);
CREATE INDEX ON gps_data (time DESC);

-- Compression (after 7 days)
ALTER TABLE gps_data SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'time DESC',
    timescaledb.compress_segmentby = 'imei'
);
SELECT add_compression_policy('gps_data', INTERVAL '7 days');

-- Retention (90 days)
SELECT add_retention_policy('gps_data', INTERVAL '90 days');
```

---

## 5. ⚡ DATA FLOW PIPELINE {#data-flow-pipeline}

```
GPS Device (Teltonika)
        │
        │ TCP Binary (Codec8)
        ▼
  ┌─────────────┐
  │  TCP Server  │  (Go, port 5027, goroutine per device)
  └──────┬──────┘
         │ Decode AVL Packet
         │
         ▼
  ┌─────────────────┐
  │  Redis Stream    │  XADD gps:stream * imei xxx lat yyy ...
  │  "gps:stream"   │  (buffer, backpressure handling)
  └──────┬──────────┘
         │
         │ XREADGROUP (consumer group "workers")
         ▼
  ┌─────────────────────────────────────────────┐
  │              Worker Pool (10 goroutines)      │
  │                                               │
  │  1. Validate GPS point                        │
  │  2. Add to batch buffer                       │
  │  3. Every 500 rows OR 2 seconds:              │
  │     ├─→ Bulk INSERT → TimescaleDB (gps_data)  │
  │     ├─→ SET gps:latest:{imei} → Redis         │
  │     ├─→ Publish to Redis channel → WS Hub     │
  │     └─→ Check geofences → alert if needed     │
  └─────────────────────────────────────────────┘
         │                │               │
         ▼                ▼               ▼
  ┌──────────┐   ┌──────────────┐   ┌──────────────┐
  │TimescaleDB│   │  Redis Cache │   │  WebSocket   │
  │(gps_data)│   │gps:latest:*  │   │  Clients     │
  └──────────┘   └──────────────┘   └──────────────┘
         │
         ▼ (nightly cron)
  ┌──────────────────┐
  │  Report Engine   │ → movement_reports + trips tables
  └──────────────────┘
```

---

## 6. 🗂️ STORAGE LAYERS {#storage-layers}

| Layer | Technology | Data | Access Speed | Retention |
|-------|-----------|------|-------------|-----------|
| 🔴 Hot Cache | Redis | Latest location per vehicle | < 1ms | 1 hour TTL |
| 🟡 Recent | TimescaleDB (uncompressed) | Raw GPS (7 days) | < 10ms | 7 days |
| 🟢 Cold | TimescaleDB (compressed) | Raw GPS (90 days) | < 100ms | 90 days |
| 📊 Aggregated | PostgreSQL | Movement reports, trips | < 5ms | Forever |
| 📑 Cache | Redis | Report JSON | < 1ms | 24h TTL |

---

## 7. 🚫 PERFORMANCE RULES {#performance-rules}

### NEVER DO THIS:
```go
// ❌ Insert one row at a time
for _, point := range points {
    db.Exec("INSERT INTO gps_data ...", point)
}

// ❌ Query raw gps_data for daily reports
rows, _ := db.Query("SELECT * FROM gps_data WHERE date = $1", date)

// ❌ Poll database for live tracking
for {
    db.Query("SELECT * FROM gps_data WHERE imei = $1 ORDER BY time DESC LIMIT 1", imei)
    time.Sleep(time.Second)
}
```

### ALWAYS DO THIS:
```go
// ✅ Batch insert (500 rows with pgx CopyFrom)
_, err = pool.CopyFrom(ctx,
    pgx.Identifier{"gps_data"},
    []string{"imei", "time", "lat", "lng", "speed"},
    pgx.CopyFromRows(rows),
)

// ✅ Query movement_reports for dashboard
db.QueryRow("SELECT * FROM movement_reports WHERE vehicle_id=$1 AND report_date=$2", id, date)

// ✅ Use Redis for live location
val, _ := redis.Get(ctx, "gps:latest:"+imei).Result()
```

---

## 8. 📡 API REFERENCE {#api-reference}

### Key Endpoints

| Method | Endpoint | Description | Response Time |
|--------|----------|-------------|---------------|
| GET | `/api/v1/vehicles/live` | All vehicles latest location | < 50ms (Redis) |
| GET | `/api/v1/vehicles/{id}/latest` | Single vehicle location | < 5ms (Redis) |
| GET | `/api/v1/vehicles/{id}/playback` | Route playback data | < 200ms |
| GET | `/api/v1/reports/movement` | Daily movement report | < 20ms (cached) |
| GET | `/api/v1/report/export` | CSV/PDF export | < 2s |
| WS | `/ws/track` | Live tracking stream | Realtime |

---

## 9. 🌐 FRONTEND ARCHITECTURE {#frontend}

```
frontend/
├── Live Tracking (tracking.js)
│   ├── WebSocket connection to /ws/track
│   ├── Leaflet map with MarkerCluster
│   ├── Vehicle sidebar (online/offline filter)
│   └── Auto-fit bounds on load
│
├── Playback (playback.js)
│   ├── Fetch /playback?from=&to= API
│   ├── Draw polyline on map
│   ├── Animate marker along route
│   └── Chart.js speed graph below map
│
├── Reports (reports.js)
│   ├── Fetch movement_reports API
│   ├── Summary cards (distance, speed, idle)
│   ├── Sortable data table
│   └── Export PDF / CSV buttons
│
└── Geofence (geofence.js)
    ├── leaflet-draw integration
    ├── POST polygon to /geofences API
    └── View geofence event history
```

---

## 10. 🐳 DEPLOYMENT {#deployment}

### docker-compose.yml structure:
```yaml
services:
  app:       # Go backend (ports 8080, 5027, 8081)
  postgres:  # PostgreSQL 15 + TimescaleDB
  redis:     # Redis 7
  pgadmin:   # pgAdmin4 (dev only)
  nginx:     # Reverse proxy (prod)
```

### Minimum Server Requirements:
| Environment | CPU | RAM | Storage |
|-------------|-----|-----|---------|
| Development | 2 cores | 4 GB | 20 GB SSD |
| Production (1k vehicles) | 4 cores | 8 GB | 200 GB SSD |
| Production (10k vehicles) | 8 cores | 16 GB | 1 TB SSD |

---

## 📦 GO DEPENDENCIES

```
github.com/jackc/pgx/v5          — PostgreSQL driver (pgx, fastest)
github.com/redis/go-redis/v9     — Redis client
github.com/gorilla/websocket     — WebSocket server
github.com/go-chi/chi/v5         — HTTP router (lightweight, fast)
github.com/golang-jwt/jwt/v5     — JWT authentication
github.com/jung-kurt/gofpdf      — PDF generation
github.com/robfig/cron/v3        — Cron scheduler
github.com/joho/godotenv         — .env file support
github.com/rs/zerolog            — Structured logging
```

---

*Generated by GPS Tracking System Architecture Reference*  
*Stack: Go + TimescaleDB + Redis + Leaflet.js*
