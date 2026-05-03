# 🚛 ISWM JAIPUR HERITAGE — GPS VEHICLE TRACKING SYSTEM
## COMPLETE MASTER PROMPT + FULL PROJECT STRUCTURE + BUILD MAP
### Version 2.0 — Production Grade | Based on Real Data Schema

---

> **COPY THIS ENTIRE FILE INTO YOUR IDE (Cursor / Windsurf / VS Code + Copilot)**
> This prompt is self-contained. Every section references real data from your system.

---

## 📋 TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Real Data Schema Reference](#2-real-data-schema-reference)
3. [Complete Database Design](#3-complete-database-design)
4. [Redis Architecture](#4-redis-architecture)
5. [GPS Ingestion Pipeline](#5-gps-ingestion-pipeline)
6. [Live Tracking & WebSocket](#6-live-tracking--websocket)
7. [Playback Engine](#7-playback-engine)
8. [Movement Reports Engine](#8-movement-reports-engine)
9. [Alert System](#9-alert-system)
10. [Geofencing Engine](#10-geofencing-engine)
11. [Region Hierarchy (City → Zone → Ward)](#11-region-hierarchy-city--zone--ward)
12. [Parking Lots System](#12-parking-lots-system)
13. [Vehicle Management](#13-vehicle-management)
14. [User & Role Management](#14-user--role-management)
15. [Shift & Route Management](#15-shift--route-management)
16. [REST API Specification](#16-rest-api-specification)
17. [Export Engine (PDF + CSV)](#17-export-engine-pdf--csv)
18. [Frontend Dashboard Specification](#18-frontend-dashboard-specification)
19. [Reports Module (All 30+ Reports)](#19-reports-module-all-30-reports)
20. [Full Project File Structure](#20-full-project-file-structure)
21. [Build Order / Creation Map](#21-build-order--creation-map)
22. [Environment Config](#22-environment-config)
23. [Docker Setup](#23-docker-setup)
24. [Performance Rules](#24-performance-rules)

---

## 1. SYSTEM OVERVIEW

### Project Name
**ISWM Jaipur Heritage — GPS Vehicle Tracking & Waste Management System**

### What This System Does
A full-stack, production-grade GPS tracking platform for the Jaipur Heritage Municipal Corporation. It:
- Receives real-time GPS data from **Teltonika** devices (IMEI-based)
- Tracks **900+ vehicles** across **Jaipur Heritage** (city → zones → wards)
- Records movement reports, trips, alerts, parking, geofencing events
- Provides a live map dashboard, playback, and 30+ reports
- Manages employees, drivers, shifts, routes, fuel, weighbridges, transfer stations

### Tech Stack
| Layer | Technology |
|---|---|
| Backend | **Golang 1.22+** |
| Primary DB | **PostgreSQL 15 + TimescaleDB** |
| Cache / Real-time | **Redis 7** |
| Message Queue | **Redis Streams** (or NATS) |
| Frontend | **Leaflet.js + Vanilla JS** (or React) |
| Maps | **Leaflet 1.9 + OpenStreetMap** |
| Auth | **JWT + RBAC** |
| Export | **gofpdf + encoding/csv** |
| Container | **Docker + Docker Compose** |

### Real Deployment Context
- **City**: Jaipur, Rajasthan, India
- **Org**: Jaipur Heritage (NNJ-H)
- **Zones**: Hawa Mahal-Aamer, Civil Lines, Kishanpole, Adarsh Nagar + Garages
- **Wards**: 100+ wards across zones
- **Vehicle Types**: Partitioned Tipper, Compactor, Dumper, Tractor, JCB, Jetting, Sweeper, Anti-Smog Gun, and 30+ more
- **GPS Protocol**: Teltonika Codec8 / Codec8E (IMEI-based, TCP)

---

## 2. REAL DATA SCHEMA REFERENCE

> These are the **exact fields** from your live system. All DB tables and APIs must match these.

### 2.1 GPS Datum (Raw GPS Packet)
```json
{
  "imei": "357544379971027",
  "device_type": "D3",
  "datetime": "2026-05-02T04:44:54.000Z",
  "lat": 26.8403,
  "lng": 75.6973,
  "speed": 0,
  "hdop": "0.6",
  "pdop": "0.9",
  "direction": 264,
  "sat_count": 17,
  "odometer": "7976088",
  "ignition_status": 0,
  "x_axis": -20,
  "y_axis": -31,
  "z_axis": 26,
  "io_data": {},
  "other": {},
  "distance": 0
}
```

### 2.2 Vehicle Record
```json
{
  "id": 1380,
  "registration_no": "RJ14GL4106CL",
  "chassis_no": "RJ14GL410600000",
  "is_owned": true,
  "vehicle_type_id": 3,
  "vehicle_make_id": 4,
  "capacity_type_id": 40,
  "is_active": true,
  "expected_gts_trip_count": null,
  "transfer_station_id": null,
  "expected_mileage": 0,
  "vehicle_category_id": null,
  "contractor_id": null,
  "epc_id": null,
  "regions": [],
  "sub_regions": [],
  "routes": []
}
```

### 2.3 Movement Report Record (Precomputed Daily)
```json
{
  "id": 1228061,
  "imei": "357544379971027",
  "vehicle_id": 1380,
  "report_date": "2026-05-02T00:00:00.000Z",
  "average_speed": 7.49,
  "total_distance": 28.54,
  "start_point": { "x": 75.7301299, "y": 26.80115 },
  "end_point":   { "x": 75.695645,  "y": 26.8404716 },
  "start_time": "2026-05-02T00:51:24.000Z",
  "end_time":   "2026-05-02T04:39:54.000Z",
  "alert": 3,
  "total_active_duration":    "03:48:30",
  "total_idle_duration":      "01:17:53",
  "total_stoppage_duration":  "01:47:44",
  "in_parking_duration":      "06:21:09",
  "actual_ignition_on_duration": "03:18:44",
  "total_ignition_on_duration":  "03:50:53",
  "fuel_in_ltr": 0,
  "fuel_consumption": 0,
  "speed_limit": 0,
  "max_speed": 0,
  "min_speed": 0,
  "overspeed_distance": 0,
  "overspeed_count": "0",
  "overspeed_time": "0",
  "day_running_time": "...",
  "night_running_time": "...",
  "total_running_duration": "...",
  "total_running_time": "..."
}
```

### 2.4 Zone Data (Region Hierarchy Level 2)
```json
{
  "id": 177,
  "region_name": "Hawa Mahal-Aamer Zone",
  "geofence_id": 1096,
  "parent_id": 176,
  "region_code": "1",
  "region_type_id": 2,
  "parents": {
    "id": 176,
    "region_name": "Jaipur Heritage",
    "region_code": "NNJ-H",
    "region_type_id": 1
  }
}
```

### 2.5 Ward Data (Region Hierarchy Level 3)
```json
{
  "id": 341,
  "region_name": "Ward - 1",
  "geofence_id": 1799,
  "parent_id": 177,
  "region_code": "1",
  "region_type_id": 3,
  "is_active": true,
  "parents": {
    "id": 177,
    "region_name": "Hawa Mahal-Aamer Zone"
  }
}
```

### 2.6 Parking Lot Record
```json
{
  "id": 35,
  "parking_lot_name": "New Atish Market Parking",
  "address": "Shanthi Nagar, Mansarovar, Jaipur",
  "contact_no": "7610818019",
  "geofence_id": 2392,
  "geometry": {
    "geometry_json": {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[...]]
      }
    },
    "geometry_border_color": "#000000",
    "geometry_fill_color": "#000000"
  }
}
```

### 2.7 Vehicle Types (Active)
| ID | Type Name | Count |
|---|---|---|
| 3 | Partitioned Tipper | 691 |
| 650 | Tractor | 62 |
| 640 | Jetting | 29 |
| 638 | JCB | 20 |
| 648 | TATA TRUCK | 19 |
| 657 | Tractor-mounted | 18 |
| 633 | Compactor | 16 |
| 619 | Dumper | 15 |
| 635 | NNJ Dumper | 10 |
| 617 | NNJ Compactor | 7 |
| 654 | GOBBLER | 6 |
| 645 | Road Sweeping Machine | 4 |
| 643 | Pickup | 4 |
| 653 | Cattle Catcher | 4 |
| 631 | Ambulance | 3 |
| 655 | ANTI SMOG GUN | 3 |
| 651 | SUPER SUCKER | 2 |
| 646 | Robot | 2 |

---

## 3. COMPLETE DATABASE DESIGN

### 3.1 Raw GPS Data (TimescaleDB Hypertable)
```sql
CREATE TABLE gps_data (
    id          BIGSERIAL,
    imei        TEXT NOT NULL,
    device_type TEXT,
    datetime    TIMESTAMPTZ NOT NULL,
    lat         DOUBLE PRECISION,
    lng         DOUBLE PRECISION,
    speed       FLOAT,
    hdop        FLOAT,
    pdop        FLOAT,
    direction   INT,
    sat_count   INT,
    odometer    BIGINT,
    ignition_status INT DEFAULT 0,  -- 0=off, 1=on
    x_axis      INT,
    y_axis      INT,
    z_axis      INT,
    io_data     JSONB,
    other_data  JSONB,
    distance    FLOAT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

SELECT create_hypertable('gps_data', 'datetime');
CREATE INDEX ON gps_data (imei, datetime DESC);
CREATE INDEX ON gps_data (datetime DESC);
```

### 3.2 Vehicles
```sql
CREATE TABLE vehicles (
    id                      SERIAL PRIMARY KEY,
    registration_no         TEXT UNIQUE NOT NULL,
    chassis_no              TEXT,
    is_owned                BOOLEAN DEFAULT true,
    lease_end_date          DATE,
    vehicle_type_id         INT REFERENCES vehicle_types(id),
    vehicle_make_id         INT REFERENCES vehicle_makes(id),
    capacity_type_id        INT REFERENCES capacity_types(id),
    vehicle_category_id     INT,
    contractor_id           INT,
    epc_id                  INT,
    transfer_station_id     INT,
    expected_gts_trip_count INT,
    expected_mileage        FLOAT DEFAULT 0,
    is_active               BOOLEAN DEFAULT true,
    created_by              INT,
    updated_by              INT,
    deleted_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 Vehicle Types
```sql
CREATE TABLE vehicle_types (
    id                    SERIAL PRIMARY KEY,
    vehicle_type_name     TEXT NOT NULL,
    partitioned           BOOLEAN DEFAULT false,
    collection_source_id  INT,
    type_image            TEXT,
    icon_color            TEXT,
    marker_image          TEXT,
    is_active             BOOLEAN DEFAULT true,
    created_by            INT,
    deleted_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.4 GPS Devices
```sql
CREATE TABLE gps_devices (
    id                  SERIAL PRIMARY KEY,
    imei_no             TEXT UNIQUE NOT NULL,
    gps_device_type_id  INT,
    serial_no           TEXT,
    sim_no              TEXT,
    purchase_date       DATE,
    protocol_type_id    INT,
    is_active           BOOLEAN DEFAULT true,
    created_by          INT,
    deleted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Vehicle ↔ GPS Device mapping (many-to-many pivot)
CREATE TABLE vehicle_gps_map (
    vehicle_id    INT REFERENCES vehicles(id),
    gps_device_id INT REFERENCES gps_devices(id),
    PRIMARY KEY (vehicle_id, gps_device_id)
);
```

### 3.5 Movement Reports (Precomputed Daily)
```sql
CREATE TABLE movement_reports (
    id                          BIGSERIAL PRIMARY KEY,
    imei                        TEXT NOT NULL,
    vehicle_id                  INT REFERENCES vehicles(id),
    report_date                 DATE NOT NULL,
    average_speed               FLOAT,
    total_distance              FLOAT,
    start_point                 JSONB,   -- {x: lng, y: lat}
    end_point                   JSONB,
    start_time                  TIMESTAMPTZ,
    end_time                    TIMESTAMPTZ,
    alert                       INT DEFAULT 0,
    total_active_duration       TEXT,    -- "HH:MM:SS"
    total_idle_duration         TEXT,
    total_stoppage_duration     TEXT,
    in_parking_duration         TEXT,
    actual_ignition_on_duration TEXT,
    total_ignition_on_duration  TEXT,
    total_running_duration      TEXT,
    total_running_time          TEXT,
    day_running_time            TEXT,
    night_running_time          TEXT,
    fuel_in_ltr                 FLOAT DEFAULT 0,
    fuel_consumption            FLOAT DEFAULT 0,
    speed_limit                 FLOAT DEFAULT 0,
    max_speed                   FLOAT DEFAULT 0,
    min_speed                   FLOAT DEFAULT 0,
    overspeed_distance          FLOAT DEFAULT 0,
    overspeed_count             TEXT DEFAULT '0',
    overspeed_time              TEXT DEFAULT '0',
    deleted_at                  TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(imei, report_date)
);
CREATE INDEX ON movement_reports (vehicle_id, report_date DESC);
CREATE INDEX ON movement_reports (imei, report_date DESC);
```

### 3.6 Trips
```sql
CREATE TABLE trips (
    id          BIGSERIAL PRIMARY KEY,
    vehicle_id  INT REFERENCES vehicles(id),
    imei        TEXT NOT NULL,
    start_time  TIMESTAMPTZ,
    end_time    TIMESTAMPTZ,
    distance    FLOAT,
    avg_speed   FLOAT,
    max_speed   FLOAT,
    path        JSONB,    -- array of {lat, lng, time, speed}
    status      TEXT,     -- 'completed', 'in_progress'
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON trips (vehicle_id, start_time DESC);
```

### 3.7 Region Hierarchy (City → Zone → Ward)
```sql
CREATE TABLE region_types (
    id        SERIAL PRIMARY KEY,
    title     TEXT NOT NULL,   -- 'City', 'Zone', 'Ward'
    parent_id INT REFERENCES region_types(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE regions (
    id                    SERIAL PRIMARY KEY,
    region_name           TEXT NOT NULL,
    geofence_id           INT REFERENCES geofences(id),
    parent_id             INT REFERENCES regions(id),
    region_code           TEXT,
    estimated_population  INT,
    region_type_id        INT REFERENCES region_types(id),
    is_active             BOOLEAN,
    created_by            INT,
    updated_by            INT,
    deleted_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);
-- Index for parent traversal
CREATE INDEX ON regions (parent_id);
CREATE INDEX ON regions (region_type_id);
```

**Known Region Data:**
```
Level 1 (City):   176 - Jaipur Heritage (NNJ-H)
Level 2 (Zone):   177 - Hawa Mahal-Aamer Zone
                  178 - Civil Lines Zone
                  179 - Kishanpole Zone
                  180 - Adarsh Nagar Zone
                  441 - Garage_Vehicle
                  445 - Hawa Mahal_Amer_Garage
                  447 - Civil Lines Zone_Garage
                  448 - Kishanpole Zone_Garage
                  449 - Adarsh Nagar Zone_Garage
Level 3 (Ward):   341+ - Ward-1 through Ward-100+ (parent = zone id)
```

### 3.8 Geofences
```sql
CREATE TABLE geofences (
    id                    SERIAL PRIMARY KEY,
    geometry_name         TEXT,
    geometry_json         JSONB NOT NULL,  -- GeoJSON Feature
    geometry_type         TEXT,            -- 'Polygon', 'LineString'
    geometry_border_color TEXT DEFAULT '#000000',
    geometry_fill_color   TEXT DEFAULT '#000000',
    is_geofence           BOOLEAN DEFAULT true,
    is_active             BOOLEAN,
    created_by            INT,
    updated_by            INT,
    deleted_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.9 Parking Lots
```sql
CREATE TABLE parking_lots (
    id               SERIAL PRIMARY KEY,
    parking_lot_name TEXT NOT NULL,
    address          TEXT,
    contact_no       TEXT,
    geofence_id      INT REFERENCES geofences(id),
    is_active        BOOLEAN,
    created_by       INT,
    updated_by       INT,
    deleted_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Parking Lot ↔ Region mapping
CREATE TABLE parking_lot_regions (
    parking_lot_id INT REFERENCES parking_lots(id),
    region_id      INT REFERENCES regions(id),
    PRIMARY KEY (parking_lot_id, region_id)
);
```

**Known Parking Lots:**
```
35 - New Atish Market Parking (Mansarovar)
36 - Ram Niwas Parking (Adarsh Nagar)
32 - HawaMahal Parking
29 - CivilLine_Parking
34 - AdarshNagar_Nigam
33 - Kishanpol_Nigam
31 - KishanPol Parking
30 - Vivek Vihar Metro Parking
```

### 3.10 Alerts
```sql
CREATE TABLE alert_types (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,     -- 'SpeedViolation', 'Stoppage', 'UnauthorizedMovement', etc.
    is_active  BOOLEAN DEFAULT true
);

CREATE TABLE alerts (
    id           BIGSERIAL PRIMARY KEY,
    vehicle_id   INT REFERENCES vehicles(id),
    imei         TEXT,
    alert_type   TEXT NOT NULL,
    alert_detail TEXT,
    alert_time   TIMESTAMPTZ,
    lat          DOUBLE PRECISION,
    lng          DOUBLE PRECISION,
    is_resolved  BOOLEAN DEFAULT false,
    snooze_until TIMESTAMPTZ,
    reason_id    INT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON alerts (vehicle_id, alert_time DESC);
```

### 3.11 Employees & Users
```sql
CREATE TABLE employees (
    id                  SERIAL PRIMARY KEY,
    first_name          TEXT,
    last_name           TEXT,
    middle_name         TEXT,
    aadhar_no           TEXT,
    mobile_no_1         TEXT,
    mobile_no_2         TEXT,
    email               TEXT,
    address             TEXT,
    code                TEXT,
    employee_category_id INT,
    other_details       TEXT,
    is_active           BOOLEAN DEFAULT true,
    created_by          INT,
    deleted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,          -- bcrypt hash
    employee_id INT REFERENCES employees(id),
    mobile_no   TEXT,
    email       TEXT,
    is_active   BOOLEAN,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE roles (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE user_roles (
    user_id INT REFERENCES users(id),
    role_id INT REFERENCES roles(id),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE permissions (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE role_permissions (
    role_id       INT REFERENCES roles(id),
    permission_id INT REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);

-- Employee ↔ Region mapping
CREATE TABLE employee_regions (
    employee_id INT REFERENCES employees(id),
    region_id   INT REFERENCES regions(id),
    PRIMARY KEY (employee_id, region_id)
);
```

### 3.12 Shifts & Routes
```sql
CREATE TABLE shifts (
    id            SERIAL PRIMARY KEY,
    shift_name    TEXT,
    start_time    TIME,
    end_time      TIME,
    time_duration INT,   -- hours
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE routes (
    id               SERIAL PRIMARY KEY,
    route_name       TEXT,
    identification   TEXT,
    distance         FLOAT,
    route_type_id    INT,
    geometry_id      INT REFERENCES geofences(id),
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE route_vehicle_shift (
    id         SERIAL PRIMARY KEY,
    route_id   INT REFERENCES routes(id),
    vehicle_id INT REFERENCES vehicles(id),
    shift_id   INT REFERENCES shifts(id),
    date       DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.13 Transfer Stations & Weighbridges
```sql
CREATE TABLE transfer_stations (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    address     TEXT,
    geofence_id INT REFERENCES geofences(id),
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE weighbridges (
    id                  SERIAL PRIMARY KEY,
    name                TEXT,
    transfer_station_id INT REFERENCES transfer_stations(id),
    vendor_name         TEXT,
    vendor_email        TEXT,
    vendor_contact      TEXT,
    vendor_address      TEXT,
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.14 Fuel Management
```sql
CREATE TABLE fuel_stations (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    address     TEXT,
    geofence_id INT REFERENCES geofences(id),
    contact_no  TEXT,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fuel_transactions (
    id              BIGSERIAL PRIMARY KEY,
    vehicle_id      INT REFERENCES vehicles(id),
    fuel_station_id INT REFERENCES fuel_stations(id),
    quantity_ltr    FLOAT,
    amount          FLOAT,
    fuel_rate       FLOAT,
    transaction_id  TEXT,
    start_time      TIMESTAMPTZ,
    end_time        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. REDIS ARCHITECTURE

### Key Patterns
```
# Latest GPS location per vehicle
gps:latest:{imei}
Value: JSON { lat, lng, speed, direction, ignition_status, datetime, sat_count, odometer }
TTL: 300 seconds (5 min)

# Vehicle status (for dashboard counters)
vehicle:status:{vehicle_id}
Value: JSON { status: "running|idle|stopped|parked|offline", updated_at }

# Active alert count per vehicle
vehicle:alerts:{vehicle_id}
Value: INT (count)

# Live zone vehicle counters
zone:vehicle:count:{zone_id}
Value: INT

# WebSocket broadcast channel
pub:gps:live
Channel: broadcast latest GPS to all connected clients

# Worker queue (GPS packets to process)
stream:gps:incoming
Type: Redis Stream

# Session store
session:{token}
Value: JSON { user_id, role, regions, exp }
TTL: 86400 seconds (24h)
```

### Redis Stream (Ingestion Queue)
```
XADD stream:gps:incoming * imei {imei} data {json_payload}
XREADGROUP GROUP gps-workers consumer-1 COUNT 100 BLOCK 100 STREAMS stream:gps:incoming >
```

---

## 5. GPS INGESTION PIPELINE

### Flow
```
GPS Device (Teltonika)
    ↓ TCP Packet (Codec8 / Codec8E)
Go TCP Server (port 5027)
    ↓ Decode IMEI + AVL records
Validate & Sanitize
    ↓
XADD → Redis Stream
    ↓
Worker Pool (goroutines)
    ├── Batch Insert → TimescaleDB gps_data (every 100 records or 500ms)
    ├── SET gps:latest:{imei} → Redis (immediate)
    ├── PUBLISH pub:gps:live → Redis PubSub (for WebSocket)
    ├── Geofence Check → detect parking / zone entry/exit
    ├── Alert Check → overspeed, stoppage, unauthorized
    └── Trip Update → detect ignition ON/OFF transitions
```

### TCP Server (cmd/tcp/main.go)
```go
// Listen on :5027 for Teltonika devices
// Step 1: Read IMEI (first packet from device)
// Step 2: Send ACK 0x01
// Step 3: Read AVL data packet (Codec8 binary)
// Step 4: Decode → []GPSDatum
// Step 5: Push each datum to Redis Stream
// Step 6: Send CRC-confirmed ACK (number of records received)
```

### Codec8 Decoder (internal/decoder/codec8.go)
```go
type GPSDatum struct {
    IMEI          string
    DeviceType    string
    Datetime      time.Time
    Lat           float64
    Lng           float64
    Speed         float32
    HDOP          float32
    PDOP          float32
    Direction     int
    SatCount      int
    Odometer      int64
    IgnitionStatus int   // IOElement: ID 239
    XAxis         int
    YAxis         int
    ZAxis         int
    IOData        map[string]interface{}
    Distance      float32
}
```

---

## 6. LIVE TRACKING & WEBSOCKET

### WebSocket Hub (internal/ws/hub.go)
```go
// Clients connect to: ws://host/ws/live
// Hub subscribes to Redis PubSub channel: pub:gps:live
// On message received from Redis → broadcast to all WebSocket clients
// Message format:
type LiveUpdate struct {
    IMEI        string    `json:"imei"`
    VehicleID   int       `json:"vehicle_id"`
    RegNo       string    `json:"reg_no"`
    VehicleType string    `json:"vehicle_type"`
    Lat         float64   `json:"lat"`
    Lng         float64   `json:"lng"`
    Speed       float32   `json:"speed"`
    Direction   int       `json:"direction"`
    Ignition    int       `json:"ignition_status"`
    Datetime    time.Time `json:"datetime"`
    ZoneID      int       `json:"zone_id"`
    WardID      int       `json:"ward_id"`
    Status      string    `json:"status"` // running|idle|stopped|parked|offline
    AlertCount  int       `json:"alert_count"`
}
```

### Status Logic
```
- speed > 5 km/h AND ignition = 1  → "running"
- speed = 0 AND ignition = 1       → "idle"
- speed = 0 AND ignition = 0       → "stopped"
- inside parking lot geofence      → "parked"
- no data for > 5 min              → "offline"
```

---

## 7. PLAYBACK ENGINE

### API
```
GET /api/v1/vehicle/:id/playback?from=2026-05-02T00:00:00Z&to=2026-05-02T06:00:00Z&raw=false
```

### Query Strategy
```sql
-- Use downsampling for performance (every 10 seconds)
SELECT 
    lat, lng, datetime, speed, direction, ignition_status, odometer
FROM gps_data
WHERE imei = $1
  AND datetime BETWEEN $2 AND $3
ORDER BY datetime ASC
LIMIT 5000;
```

### Response Format
```json
{
  "vehicle_id": 1380,
  "reg_no": "RJ14GL4106CL",
  "from": "2026-05-02T00:00:00Z",
  "to":   "2026-05-02T06:00:00Z",
  "total_points": 1234,
  "points": [
    { "lat": 26.84, "lng": 75.69, "time": "2026-05-02T00:51:24Z", "speed": 0, "ignition": 0 }
  ],
  "stoppages": [
    { "lat": 26.84, "lng": 75.69, "start": "...", "end": "...", "duration_min": 12 }
  ]
}
```

### Playback Features (Frontend)
- Play / Pause / Stop controls
- Speed multiplier: 1x / 5x / 10x / 50x
- Scrub bar (timeline slider)
- Show stoppages (red markers)
- Show parking visits
- Overlay: Actual vs Planned route
- Option: Snapped to road vs Raw (unsnapped) — toggle
- Show/hide: Ward boundary, Zone boundary, Fuel stations, Transfer stations

---

## 8. MOVEMENT REPORTS ENGINE

### Cron Schedule
```
Run every night at 23:30 for the current day
Run at 00:15 for the previous day (catch late GPS data)
```

### Calculation Steps
```go
// For each active vehicle:
// 1. Fetch all GPS data for the day (ordered by datetime)
// 2. Calculate total_distance using Haversine formula between consecutive points
// 3. Calculate average_speed = total_distance / total_active_hours
// 4. Calculate max_speed, min_speed
// 5. Calculate ignition_on durations (sum of intervals where ignition=1)
// 6. Calculate idle_duration (ignition=1, speed=0)
// 7. Calculate stoppage_duration (ignition=0, speed=0, outside parking)
// 8. Calculate in_parking_duration (inside any parking lot polygon)
// 9. Calculate day_running_time (06:00–18:00) vs night_running_time
// 10. Calculate alert count from alerts table
// 11. Calculate overspeed_count, overspeed_distance, overspeed_time
// 12. UPSERT into movement_reports
```

### Haversine Distance (internal/service/haversine.go)
```go
func Haversine(lat1, lng1, lat2, lng2 float64) float64 {
    const R = 6371.0 // Earth radius km
    dLat := (lat2 - lat1) * math.Pi / 180
    dLng := (lng2 - lng1) * math.Pi / 180
    a := math.Sin(dLat/2)*math.Sin(dLat/2) +
        math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
        math.Sin(dLng/2)*math.Sin(dLng/2)
    return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}
```

---

## 9. ALERT SYSTEM

### Alert Types (from es.json)
```
SpeedViolation           - Vehicle exceeds speed limit
Stoppage_5_10            - Stoppage 5–10 minutes
Stoppage_10_15           - Stoppage 10–15 minutes
Stoppage_15Plus          - Stoppage 15+ minutes
UnauthorizedMovement     - Vehicle outside assigned zone/ward
LateStarted              - Vehicle started after shift start time
Deviation                - Vehicle deviated from route
Delay                    - Delay on current route
FastCoverage/Skipping    - Lane completed too quickly (skipping)
InorderRoute             - Lane not completed in order
NotStarted               - Vehicle not started at all
GPSNotReporting          - No GPS data received
OffRoute                 - Vehicle off planned route
```

### Alert Processing (internal/service/alert.go)
```go
// On every GPS point insert:
func CheckAlerts(datum GPSDatum, vehicle Vehicle, rules AlertRules) []Alert {
    var alerts []Alert
    // Check overspeed
    if datum.Speed > rules.SpeedLimit {
        alerts = append(alerts, Alert{Type: "SpeedViolation", ...})
    }
    // Check unauthorized movement (zone/ward geofence)
    if !InsideAssignedRegion(datum.Lat, datum.Lng, vehicle.Regions) {
        alerts = append(alerts, Alert{Type: "UnauthorizedMovement", ...})
    }
    return alerts
}
```

### Alert Actions
- View alert detail
- Snooze (with time in minutes)
- Follow up
- Mark as resolved
- Add reason (from predefined reason list)
- Replace Vehicle or Driver

---

## 10. GEOFENCING ENGINE

### Ray Casting Algorithm (internal/geofence/engine.go)
```go
func PointInPolygon(lat, lng float64, polygon [][2]float64) bool {
    inside := false
    j := len(polygon) - 1
    for i := 0; i < len(polygon); i++ {
        xi, yi := polygon[i][0], polygon[i][1]
        xj, yj := polygon[j][0], polygon[j][1]
        if ((yi > lat) != (yj > lat)) &&
            (lng < (xj-xi)*(lat-yi)/(yj-yi)+xi) {
            inside = !inside
        }
        j = i
    }
    return inside
}

// Parse GeoJSON coordinates from geofences.geometry_json
func ParseGeoJSONPolygon(geojson []byte) ([][2]float64, error) { ... }
```

### Geofence Events
```sql
CREATE TABLE geofence_events (
    id           BIGSERIAL PRIMARY KEY,
    vehicle_id   INT,
    geofence_id  INT,
    event_type   TEXT,   -- 'enter', 'exit'
    lat          DOUBLE PRECISION,
    lng          DOUBLE PRECISION,
    event_time   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 11. REGION HIERARCHY (CITY → ZONE → WARD)

### Hierarchy
```
Jaipur Heritage (NNJ-H) [id:176, type:1]
├── Hawa Mahal-Aamer Zone [id:177, type:2]
│   ├── Ward-1  [id:341, type:3]
│   ├── Ward-2  [id:342, type:3]
│   └── ...
├── Civil Lines Zone [id:178, type:2]
│   ├── Ward-X ...
├── Kishanpole Zone [id:179, type:2]
├── Adarsh Nagar Zone [id:180, type:2]
└── Garages (zones 441, 445, 447, 448, 449)
```

### Region API Endpoints
```
GET /api/v1/regions?type=zone         → All zones
GET /api/v1/regions?type=ward&parent=177  → All wards in zone 177
GET /api/v1/regions/:id/geofence      → Get geofence polygon for region
GET /api/v1/regions/:id/vehicles      → Vehicles assigned to region
```

---

## 12. PARKING LOTS SYSTEM

### Features
- Store polygon geofences for each parking lot
- Detect when vehicle enters/exits parking
- Calculate in_parking_duration per vehicle per day
- Show on map with polygon overlay
- 8 parking lots: HawaMahal, CivilLines, KishanPol, Adarsh Nagar, etc.

### Parking Detection (on each GPS point)
```go
func CheckParkingLots(lat, lng float64, parkingLots []ParkingLot) *ParkingLot {
    for _, pl := range parkingLots {
        polygon := ParseGeoJSONPolygon(pl.Geometry.GeometryJSON)
        if PointInPolygon(lat, lng, polygon) {
            return &pl
        }
    }
    return nil
}
```

---

## 13. VEHICLE MANAGEMENT

### Vehicle List API with Latest GPS
```
GET /api/v1/vehicles?zone_id=177&ward_id=341&type_id=3&is_active=true&page=1&limit=50
```

Response includes:
- Vehicle base info (reg_no, chassis_no, type, make, capacity)
- Linked GPS device (imei_no, serial_no, sim_no)
- Latest GPS datum (from Redis gps:latest:{imei})
- Assigned regions (zones/wards)
- Assigned routes
- Assigned employees (driver/helper)
- Today's movement report summary

### Vehicle Status Dashboard Counters
```
Total Vehicles
Active (Running) Vehicles
Inactive Vehicles
Parked Vehicles
Not Started
GPS Not Reporting
Aborted Vehicles
Unauthorized Movement
```

---

## 14. USER & ROLE MANAGEMENT

### Known Users (from userDetails.json)
```
superadmin → employee: "Nigam Admin" → zones: Adarsh Nagar, Civil Lines, etc.
```

### RBAC Roles (from es.json)
```
Monitor           - View live map, alerts, tracking
Reports           - Access all reports
D2D               - Door-to-door collection monitoring
AlertManager      - Manage and resolve alerts
EmployeeLocation  - Track employee locations
Master            - Manage master data
Manage            - Full system management
Admin             - All permissions
```

### JWT Auth
```
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me

Token payload: { user_id, username, role_ids, region_ids, exp }
Middleware: validate JWT on every protected route
```

---

## 15. SHIFT & ROUTE MANAGEMENT

### Shift Assignment
```
POST /api/v1/assign/employee-shift-vehicle
Body: { employee_id, shift_id, vehicle_id, date }
```

### Route Assignment
```
POST /api/v1/assign/route-vehicle-shift
Body: { route_id, vehicle_id, shift_id, date }
```

### Route Coverage Tracking
- Track % of route covered by vehicle
- In-order route coverage %
- Overall route coverage %
- Lane-level monitoring

---

## 16. REST API SPECIFICATION

### Base URL: `/api/v1`
### Auth: `Authorization: Bearer {jwt_token}`

#### Vehicles
```
GET    /vehicles                    → List vehicles (filter: zone, ward, type, status)
GET    /vehicles/:id                → Get vehicle detail with GPS + today's report
GET    /vehicles/:id/playback       → Route playback data
GET    /vehicles/:id/movement-report → Movement report for date range
POST   /vehicles                    → Add vehicle
PUT    /vehicles/:id                → Update vehicle
DELETE /vehicles/:id                → Soft delete vehicle
```

#### Live Tracking
```
GET    /tracking/live               → All vehicle latest positions (from Redis)
GET    /tracking/live/:imei         → Single vehicle latest position
WS     /ws/live                     → WebSocket live updates
```

#### Movement Reports
```
GET    /reports/movement?vehicle_id=&date=           → Single vehicle single day
GET    /reports/movement?zone_id=&from=&to=          → Zone range
GET    /reports/movement?ward_id=&from=&to=          → Ward range
POST   /reports/movement/export?format=csv|pdf       → Export
```

#### Alerts
```
GET    /alerts?vehicle_id=&type=&from=&to=&resolved=false
PUT    /alerts/:id/resolve
PUT    /alerts/:id/snooze
POST   /alerts/:id/reason
```

#### Regions
```
GET    /regions                     → All regions (tree structure)
GET    /regions/zones               → Zones only
GET    /regions/wards?zone_id=      → Wards by zone
GET    /regions/:id/geofence        → Geofence polygon
```

#### Parking Lots
```
GET    /parking-lots                → List all (with geofence)
GET    /parking-lots/:id/vehicles   → Vehicles currently parked
GET    /parking-lots/:id/history    → Parking events history
```

#### GPS Devices
```
GET    /gps-devices
GET    /gps-devices/:imei/latest    → Latest GPS point from Redis
POST   /gps-devices
PUT    /gps-devices/:id
```

#### Reports (all 30+)
```
GET /reports/vehicle-movement
GET /reports/zone-ward-beat-coverage
GET /reports/alerts-events
GET /reports/delay-in-starting
GET /reports/d2d-vehicle-route-coverage
GET /reports/vehicle-mustering-point
GET /reports/division-level
GET /reports/d2d-zone-ward-coverage
GET /reports/gts-trip
GET /reports/gps-log
GET /reports/lane-monitoring
GET /reports/first-lane-monitoring
GET /reports/last-lane-monitoring
GET /reports/active-vehicle-summary
GET /reports/unauthorized-movement
GET /reports/vehicle-not-moving
GET /reports/vehicle-based-on-distance
GET /reports/delay-completing-collection
GET /reports/vehicle-maintenance
GET /reports/speed-violation
GET /reports/geofence-event
GET /reports/vehicle-deployment
GET /reports/d2d-performance
GET /reports/zone-level
GET /reports/ward-level
GET /reports/vehicle-level
GET /reports/gps-not-reporting
GET /reports/fuel-summary
GET /reports/fuel-transaction
GET /reports/weighbridge-summary
GET /reports/weighbridge-report
GET /reports/trenching-ground-weighbridge
```

**All report endpoints accept:**
```
?from=DATE&to=DATE&zone_id=INT&ward_id=INT&vehicle_id=INT&format=json|csv|pdf
```

**Target response times:**
```
Live tracking API:  < 50ms   (Redis)
Single report:      < 200ms  (precomputed)
Playback query:     < 500ms  (indexed)
Export (PDF/CSV):   < 3s
```

---

## 17. EXPORT ENGINE (PDF + CSV)

### CSV Export
```go
func ExportCSV(w http.ResponseWriter, rows []MovementReport, filename string) {
    w.Header().Set("Content-Disposition", "attachment; filename="+filename)
    w.Header().Set("Content-Type", "text/csv")
    writer := csv.NewWriter(w)
    writer.Write([]string{
        "Reg No", "Date", "Total Distance (km)", "Avg Speed (kmph)",
        "Max Speed", "Active Duration", "Idle Duration",
        "Stoppage Duration", "Parking Duration",
        "Ignition ON", "Alerts", "Start Time", "End Time",
    })
    for _, r := range rows {
        writer.Write([]string{ r.RegNo, r.ReportDate.String(), ... })
    }
    writer.Flush()
}
```

### PDF Export
```go
// Use gofpdf
// Header: Logo + "ISWM Jaipur Heritage — Vehicle Movement Report"
// Table with all movement_report fields
// Footer: Page number + Generated at timestamp
// Support: A4 Portrait/Landscape
```

---

## 18. FRONTEND DASHBOARD SPECIFICATION

### Pages / Modules
```
/monitor          → Live Tracking Map (main page)
/playback         → Vehicle route playback
/reports          → All 30+ reports
/vehicles         → Vehicle management
/employees        → Employee management
/master           → Master data (zones, wards, routes, etc.)
/alerts           → Alert management
/assign           → Assignment management
/dashboard        → ISWM KPI dashboard
/fuel             → Fuel management
/weighbridge      → Weighbridge reports
```

### Live Map (Leaflet) Features
```javascript
// Map center: Jaipur Heritage area
const map = L.map('map').setView([26.9124, 75.7873], 12);

// Tile layer: OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Plugins required:
// - leaflet-markercluster  → cluster vehicle markers
// - leaflet-realtime        → live updates
// - leaflet-draw            → geofence drawing

// Vehicle markers: Use vehicle type SVG icon
// Color coding:
//   Green    → Running
//   Yellow   → Idle
//   Red      → Stopped / Alert
//   Blue     → Parked
//   Grey     → Offline

// Filters (left sidebar):
// - Select All / Unselect All vehicles
// - Filter by Zone (Hawa Mahal, Civil Lines, Kishanpole, Adarsh Nagar)
// - Filter by Ward (sub-filter)
// - Filter by Vehicle Type
// - Filter by Status (Running/Idle/Parked/Not Started/Offline)
// - Search by Reg No

// Map overlays (toggleable):
// - Region Boundary (zone/ward polygons)
// - Parking Lots (green polygons)
// - Transfer Stations (icons)
// - Fuel Stations (icons)
// - Weighbridges (icons)
// - Planned Route (blue polyline)
// - Actual Movement (orange polyline)
// - City Zones
// - Lanes

// Vehicle popup on click:
//   Reg No, Vehicle Type, Driver, Ward, Zone
//   Speed, Ignition, Last Update time
//   Buttons: [Playback] [Movement Report] [Alerts] [Map View]
//   [Replace Vehicle] [Replace Driver]

// Alert panel (right sidebar):
//   All Alerts / Speed Violation / Stoppage / Unauthorized Movement
//   Aborted / Not Started / Delayed
//   Each: Reg No, Alert Type, Time, [Snooze] [Reason] [Resolve]
```

### Dashboard KPIs
```
Total Vehicles
Active (Running) Vehicles
Inactive Vehicles
Not Started
GPS Not Reporting
Alerts Today
Zone-wise vehicle count
Ward coverage %
```

---

## 19. REPORTS MODULE (ALL 30+ REPORTS)

### Key Reports Detail

#### Vehicle Movement Report
**Columns:** Reg No | Date | Total Distance | Avg Speed | Max Speed | Active Duration | Idle Duration | Stoppage Duration | Parking Duration | Ignition ON | Actual Ignition ON | Day Running | Night Running | Total Running | Alerts | Fuel | Overspeed Count

#### GPS Log Report
**Columns:** Reg No | IMEI | Log DateTime | Latitude | Longitude | Speed | Ignition | Direction | Sat Count | Odometer

#### Speed Violation Report
**Columns:** Reg No | Time Reported | Speed | Speed Limit | Location | Duration | Distance

#### Geofence Event Report
**Columns:** Reg No | Entity Name | Event Type | Event Time | Latitude | Longitude | Received At

#### Alert & Event Report
**Columns:** Reg No | Alert Type | Alert Detail | Alert Time | Alert Location | Duration

#### GTS Trip Report (Transfer Station)
**Columns:** Reg No | Trip Count | Expected Trips | In Time | Out Time | Material | Net Weight | Transfer Station

#### Fuel Summary Report
**Columns:** Reg No | Fuel Station | Quantity (Litre) | Amount (INR) | Rate/Ltr | Transaction Start | Transaction End | Transaction ID

#### Weighbridge Report
**Columns:** RST No | Reg No | Material | Gross Weight (kg) | Tare Weight (kg) | Net Weight (mt) | Dry Weight | Wet Weight | Gross DateTime | Tare DateTime | Collection Center

---

## 20. FULL PROJECT FILE STRUCTURE

```
iswm-gps-tracking/
│
├── cmd/
│   ├── server/
│   │   └── main.go                  # HTTP server + router (Gin/Chi)
│   ├── tcp/
│   │   └── main.go                  # TCP server for GPS device connections
│   └── cron/
│       └── main.go                  # Cron job runner (movement reports)
│
├── internal/
│   │
│   ├── config/
│   │   └── config.go                # Load env vars, DB/Redis config
│   │
│   ├── tcp/
│   │   ├── server.go                # TCP listener (port 5027)
│   │   ├── handler.go               # Per-connection handler goroutine
│   │   └── session.go               # Track IMEI per TCP session
│   │
│   ├── decoder/
│   │   ├── codec8.go                # Teltonika Codec8 binary decoder
│   │   ├── codec8e.go               # Teltonika Codec8E extended decoder
│   │   ├── imei.go                  # IMEI packet parser
│   │   └── models.go                # GPSDatum, IOElement structs
│   │
│   ├── worker/
│   │   ├── pool.go                  # Worker goroutine pool
│   │   ├── consumer.go              # Redis Stream consumer (XREADGROUP)
│   │   └── batch_insert.go          # Bulk insert to TimescaleDB (pgx COPY)
│   │
│   ├── repository/
│   │   ├── db.go                    # pgx connection pool setup
│   │   ├── redis.go                 # Redis client setup
│   │   ├── gps_repo.go              # GPS data CRUD
│   │   ├── vehicle_repo.go          # Vehicle CRUD
│   │   ├── movement_report_repo.go  # Movement report read/write
│   │   ├── alert_repo.go            # Alert CRUD
│   │   ├── region_repo.go           # Region / Zone / Ward queries
│   │   ├── geofence_repo.go         # Geofence polygon load/save
│   │   ├── parking_repo.go          # Parking lots queries
│   │   ├── user_repo.go             # User / auth queries
│   │   ├── trip_repo.go             # Trip read/write
│   │   └── report_repo.go           # All 30+ reports queries
│   │
│   ├── service/
│   │   ├── gps_service.go           # GPS processing logic
│   │   ├── vehicle_service.go       # Vehicle business logic
│   │   ├── movement_service.go      # Movement report computation
│   │   ├── trip_service.go          # Trip segmentation logic
│   │   ├── alert_service.go         # Alert detection & resolution
│   │   ├── haversine.go             # Haversine distance calculation
│   │   ├── status_service.go        # Vehicle status (running/idle/etc.)
│   │   ├── region_service.go        # Region hierarchy business logic
│   │   └── export_service.go        # PDF + CSV generation
│   │
│   ├── api/
│   │   ├── router.go                # Route registration (Gin)
│   │   ├── middleware/
│   │   │   ├── auth.go              # JWT validation middleware
│   │   │   ├── rbac.go              # Role-based access middleware
│   │   │   └── cors.go              # CORS middleware
│   │   ├── handlers/
│   │   │   ├── auth_handler.go      # Login, logout, me
│   │   │   ├── vehicle_handler.go   # Vehicle CRUD + status
│   │   │   ├── tracking_handler.go  # Live positions (from Redis)
│   │   │   ├── playback_handler.go  # Playback query
│   │   │   ├── report_handler.go    # Movement reports API
│   │   │   ├── alert_handler.go     # Alert list, resolve, snooze
│   │   │   ├── region_handler.go    # Zones, wards, geofences
│   │   │   ├── parking_handler.go   # Parking lots
│   │   │   ├── employee_handler.go  # Employee & driver management
│   │   │   ├── assign_handler.go    # All assignment endpoints
│   │   │   ├── export_handler.go    # CSV/PDF export
│   │   │   └── dashboard_handler.go # KPI dashboard data
│   │
│   ├── ws/
│   │   ├── hub.go                   # WebSocket hub (manages clients)
│   │   ├── client.go                # Per-client WebSocket connection
│   │   └── broadcaster.go           # Redis PubSub → WebSocket broadcast
│   │
│   ├── geofence/
│   │   ├── engine.go                # Ray casting point-in-polygon
│   │   ├── loader.go                # Load geofences from DB into memory
│   │   └── cache.go                 # In-memory geofence cache
│   │
│   └── cron/
│       ├── scheduler.go             # Cron job definitions (robfig/cron)
│       ├── movement_cron.go         # Nightly movement report computation
│       └── cleanup_cron.go          # Old GPS data cleanup
│
├── migrations/
│   ├── 001_create_gps_data.sql
│   ├── 002_create_vehicles.sql
│   ├── 003_create_vehicle_types.sql
│   ├── 004_create_gps_devices.sql
│   ├── 005_create_regions.sql
│   ├── 006_create_geofences.sql
│   ├── 007_create_movement_reports.sql
│   ├── 008_create_trips.sql
│   ├── 009_create_alerts.sql
│   ├── 010_create_parking_lots.sql
│   ├── 011_create_employees.sql
│   ├── 012_create_users.sql
│   ├── 013_create_roles_permissions.sql
│   ├── 014_create_shifts.sql
│   ├── 015_create_routes.sql
│   ├── 016_create_transfer_stations.sql
│   ├── 017_create_weighbridges.sql
│   ├── 018_create_fuel_stations.sql
│   ├── 019_create_fuel_transactions.sql
│   ├── 020_create_geofence_events.sql
│   └── 021_seed_data.sql            # Seed zones, wards, vehicle types
│
├── frontend/
│   ├── index.html                   # Entry point
│   ├── css/
│   │   ├── main.css                 # Global styles (dark theme)
│   │   ├── sidebar.css              # Left sidebar vehicle list
│   │   ├── alert-panel.css          # Right alert panel
│   │   └── dashboard.css            # Dashboard KPI cards
│   ├── js/
│   │   ├── app.js                   # Main app entry
│   │   ├── map.js                   # Leaflet map init + overlays
│   │   ├── live-tracking.js         # WebSocket live updates handler
│   │   ├── vehicle-list.js          # Left sidebar vehicle list logic
│   │   ├── playback.js              # Playback controls + animation
│   │   ├── alerts.js                # Alert panel + actions
│   │   ├── filters.js               # Zone/ward/type filters
│   │   ├── regions.js               # Draw zone/ward boundaries
│   │   ├── parking.js               # Draw parking lot polygons
│   │   ├── reports.js               # Reports page logic
│   │   ├── dashboard.js             # KPI dashboard
│   │   └── api.js                   # All API call wrappers
│   └── assets/
│       ├── icons/                   # Vehicle type SVG icons
│       └── logo.png
│
├── scripts/
│   ├── seed_zones.go                # Seed Jaipur Heritage zones/wards
│   ├── seed_parking_lots.go         # Seed 8 parking lots with geofences
│   ├── seed_vehicle_types.go        # Seed all vehicle types
│   └── migrate.go                  # Run migrations
│
├── docker/
│   ├── Dockerfile.server            # Go HTTP + TCP server
│   ├── Dockerfile.cron              # Cron worker
│   └── init.sql                     # TimescaleDB extension setup
│
├── docker-compose.yml               # Full stack: Go + TimescaleDB + Redis
├── go.mod
├── go.sum
├── .env.example
└── README.md
```

---

## 21. BUILD ORDER / CREATION MAP

### Phase 1 — Foundation (Day 1)
```
[ ] go mod init iswm-gps-tracking
[ ] Install dependencies (gin, pgx, go-redis, jwt-go, robfig/cron, gofpdf)
[ ] internal/config/config.go
[ ] migrations/ (001 → 021 — run in order)
[ ] docker-compose.yml (TimescaleDB + Redis)
[ ] docker/init.sql (CREATE EXTENSION timescaledb)
[ ] scripts/seed_zones.go → seed Jaipur Heritage regions
[ ] scripts/seed_parking_lots.go → seed 8 parking lots
[ ] scripts/seed_vehicle_types.go → seed 30+ vehicle types
```

### Phase 2 — Data Layer (Day 1–2)
```
[ ] internal/repository/db.go      → pgx pool
[ ] internal/repository/redis.go   → Redis client
[ ] internal/decoder/models.go     → GPSDatum, Vehicle, etc.
[ ] internal/decoder/codec8.go     → Binary Teltonika decoder
[ ] internal/decoder/codec8e.go
[ ] internal/decoder/imei.go
[ ] internal/repository/gps_repo.go
[ ] internal/repository/vehicle_repo.go
[ ] internal/repository/region_repo.go
[ ] internal/repository/geofence_repo.go
[ ] internal/repository/parking_repo.go
```

### Phase 3 — TCP Ingestion Pipeline (Day 2)
```
[ ] cmd/tcp/main.go                 → TCP listener
[ ] internal/tcp/server.go
[ ] internal/tcp/handler.go
[ ] internal/worker/pool.go
[ ] internal/worker/consumer.go    → Redis Stream consumer
[ ] internal/worker/batch_insert.go → pgx COPY bulk insert
```

### Phase 4 — Business Logic (Day 3)
```
[ ] internal/geofence/engine.go    → Ray casting
[ ] internal/geofence/loader.go    → Load all geofences on startup
[ ] internal/geofence/cache.go
[ ] internal/service/haversine.go
[ ] internal/service/status_service.go
[ ] internal/service/alert_service.go
[ ] internal/service/trip_service.go
[ ] internal/service/gps_service.go  → Orchestrate all checks on GPS insert
[ ] internal/service/movement_service.go
```

### Phase 5 — WebSocket & Live Tracking (Day 3)
```
[ ] internal/ws/hub.go
[ ] internal/ws/client.go
[ ] internal/ws/broadcaster.go     → Redis PubSub subscriber
[ ] internal/repository/redis.go   → Add PubSub + Latest GPS methods
```

### Phase 6 — REST API (Day 4)
```
[ ] internal/api/middleware/auth.go
[ ] internal/api/middleware/rbac.go
[ ] internal/api/middleware/cors.go
[ ] internal/api/handlers/auth_handler.go
[ ] internal/api/handlers/vehicle_handler.go
[ ] internal/api/handlers/tracking_handler.go
[ ] internal/api/handlers/playback_handler.go
[ ] internal/api/handlers/report_handler.go
[ ] internal/api/handlers/alert_handler.go
[ ] internal/api/handlers/region_handler.go
[ ] internal/api/handlers/parking_handler.go
[ ] internal/api/handlers/assign_handler.go
[ ] internal/api/handlers/export_handler.go
[ ] internal/api/handlers/dashboard_handler.go
[ ] internal/api/router.go
[ ] cmd/server/main.go             → Wire everything
```

### Phase 7 — Cron Jobs (Day 5)
```
[ ] internal/repository/report_repo.go
[ ] internal/repository/movement_report_repo.go
[ ] internal/cron/movement_cron.go
[ ] internal/cron/cleanup_cron.go
[ ] internal/cron/scheduler.go
[ ] cmd/cron/main.go
```

### Phase 8 — Export (Day 5)
```
[ ] internal/service/export_service.go  → CSV + PDF
[ ] internal/api/handlers/export_handler.go
[ ] internal/repository/report_repo.go  → All 30+ report queries
```

### Phase 9 — Frontend (Day 6–7)
```
[ ] frontend/index.html
[ ] frontend/js/api.js
[ ] frontend/js/app.js
[ ] frontend/js/map.js             → Leaflet init, overlays
[ ] frontend/js/live-tracking.js   → WebSocket handler
[ ] frontend/js/vehicle-list.js
[ ] frontend/js/alerts.js
[ ] frontend/js/filters.js
[ ] frontend/js/regions.js
[ ] frontend/js/parking.js
[ ] frontend/js/playback.js
[ ] frontend/js/reports.js
[ ] frontend/js/dashboard.js
[ ] frontend/css/*.css
[ ] frontend/assets/icons/         → SVG icons per vehicle type
```

### Phase 10 — Testing & Docker (Day 8)
```
[ ] Unit tests for decoder, haversine, geofence engine
[ ] Integration test: TCP → Redis → DB pipeline
[ ] docker/Dockerfile.server
[ ] docker/Dockerfile.cron
[ ] docker-compose.yml (full stack)
[ ] README.md
[ ] .env.example
```

---

## 22. ENVIRONMENT CONFIG

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=iswm_gps
DB_MAX_CONNS=50
DB_MIN_CONNS=10

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_STREAM_KEY=stream:gps:incoming
REDIS_CONSUMER_GROUP=gps-workers
REDIS_PUBSUB_CHANNEL=pub:gps:live

# Server
HTTP_PORT=8080
TCP_PORT=5027

# JWT
JWT_SECRET=your-super-secret-key
JWT_EXPIRY_HOURS=24

# Batch processing
BATCH_SIZE=100
BATCH_FLUSH_MS=500
WORKER_COUNT=10

# Geofence cache refresh
GEOFENCE_CACHE_TTL_MIN=10

# Cron schedule
MOVEMENT_REPORT_CRON=30 23 * * *
CLEANUP_CRON=0 2 * * *

# Data retention
GPS_RETENTION_DAYS=90
```

---

## 23. DOCKER SETUP

### docker-compose.yml
```yaml
version: '3.9'
services:
  timescaledb:
    image: timescale/timescaledb:latest-pg15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: iswm_gps
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  server:
    build:
      context: .
      dockerfile: docker/Dockerfile.server
    ports:
      - "8080:8080"
      - "5027:5027"
    env_file: .env
    depends_on: [timescaledb, redis]

  cron:
    build:
      context: .
      dockerfile: docker/Dockerfile.cron
    env_file: .env
    depends_on: [timescaledb, redis]

volumes:
  pgdata:
```

### docker/init.sql
```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

---

## 24. PERFORMANCE RULES

### NEVER do this ❌
```
- Insert GPS rows one by one
- Query gps_data for live vehicle position (use Redis instead)
- JOIN gps_data with other tables in reports
- Generate movement reports on demand (precompute them)
- Load all geofences from DB on every GPS point (cache in memory)
- SELECT * on large tables without index
```

### ALWAYS do this ✅
```
- Batch insert gps_data (100 rows at a time using pgx COPY)
- Use Redis gps:latest:{imei} for all live queries
- Use movement_reports table for all report queries
- Keep geofence polygons in memory (reload every 10 min)
- Use connection pooling (pgx pool, Redis pool)
- Use goroutine worker pool (not unlimited goroutines)
- Index: (imei, datetime DESC) on gps_data
- Index: (vehicle_id, report_date DESC) on movement_reports
- Use TIMESTAMPTZ (not TIMESTAMP) for all time columns
- Soft delete (deleted_at) not hard delete
```

### Expected Performance Targets
| Operation | Target |
|---|---|
| GPS packet ingestion | < 10ms per packet |
| Live position lookup | < 5ms (Redis) |
| Vehicle list with status | < 50ms |
| Single movement report | < 100ms |
| Zone-level report (all vehicles, 1 day) | < 500ms |
| Playback query (6 hrs, 1 vehicle) | < 500ms |
| CSV export (1000 vehicles) | < 3s |
| PDF export (single vehicle, 1 month) | < 2s |
| WebSocket broadcast | < 100ms latency |

---

## 📦 DEPENDENCIES (go.mod)

```go
require (
    github.com/gin-gonic/gin v1.9.1
    github.com/jackc/pgx/v5 v5.5.0
    github.com/redis/go-redis/v9 v9.3.0
    github.com/golang-jwt/jwt/v5 v5.0.0
    github.com/robfig/cron/v3 v3.0.1
    github.com/jung-kurt/gofpdf v1.16.2
    github.com/joho/godotenv v1.5.1
    golang.org/x/crypto v0.17.0
)
```

---

## 🎯 FINAL MASTER PROMPT (PASTE INTO IDE)

```
Build a production-grade GPS Vehicle Tracking System for ISWM Jaipur Heritage Municipal Corporation.

STACK: Golang 1.22, PostgreSQL 15 + TimescaleDB, Redis 7, Leaflet.js, Gin web framework, pgx/v5, JWT auth.

CONTEXT: Jaipur Heritage city hierarchy — City (176) → Zones (177-180, 441-449) → Wards (341+). 
900+ vehicles including Partitioned Tippers (691), Tractors (62), JCBs (20), Compactors (16), etc.
GPS devices: Teltonika (IMEI-based, Codec8/Codec8E, TCP port 5027).
8 parking lots with GeoJSON polygons.

CORE DATA MODELS (match these exactly):
- gps_data: imei, datetime, lat, lng, speed, hdop, pdop, direction, sat_count, odometer, ignition_status, x_axis, y_axis, z_axis, io_data, distance
- movement_reports: imei, vehicle_id, report_date, average_speed, total_distance, start/end point {x,y}, start/end time, alert count, total_active_duration, total_idle_duration, total_stoppage_duration, in_parking_duration, actual_ignition_on_duration, total_ignition_on_duration, day_running_time, night_running_time, fuel_in_ltr, max_speed, min_speed, overspeed_count, overspeed_distance
- vehicles: registration_no, chassis_no, vehicle_type_id, vehicle_make_id, capacity_type_id, is_owned, is_active, expected_gts_trip_count, transfer_station_id

BUILD THESE MODULES IN ORDER:
1. TimescaleDB hypertable (gps_data) + all 21 migration files
2. Teltonika Codec8 TCP decoder (port 5027) → Redis Stream
3. Worker pool: Redis Stream consumer → batch insert (pgx COPY protocol)
4. Redis: gps:latest:{imei} (TTL 5min) + pub:gps:live channel
5. Geofence engine: ray casting, in-memory cache, parking detection
6. Alert service: overspeed, stoppage (5/10/15min), unauthorized movement
7. Trip segmentation: ignition ON/OFF transitions
8. Nightly cron: compute movement_reports (haversine distance, durations, speeds)
9. REST API (Gin): vehicles, tracking, playback, reports, alerts, regions, parking, export
10. WebSocket hub: Redis PubSub subscriber → broadcast to all clients
11. JWT auth + RBAC (roles: Monitor, Reports, AlertManager, Admin, D2D, Master)
12. Export: CSV + PDF (gofpdf) for all 30+ report types
13. Leaflet frontend: dark theme, live markers (color by status), vehicle list sidebar, alert panel, playback with controls, zone/ward/parking polygons

PERFORMANCE REQUIREMENTS:
- Live position: < 5ms (Redis only, never query DB)
- Movement report query: < 100ms (precomputed table)  
- Playback (6hr): < 500ms with LIMIT 5000 + sampling
- Batch insert: 100 rows per pgx COPY call
- Worker pool: 10 goroutines, never unlimited

Follow clean architecture: /cmd, /internal/{tcp,decoder,worker,repository,service,api,ws,geofence,cron}, /migrations, /frontend.
Use soft deletes (deleted_at). All times in TIMESTAMPTZ. Index (imei, datetime DESC) and (vehicle_id, report_date DESC).
Docker Compose: TimescaleDB + Redis + Go server + Go cron worker.
```

---

*End of ISWM GPS Tracking Master Prompt v2.0*
*Generated for: Jaipur Heritage Municipal Corporation*
*Project: ISWM GPS Vehicle Tracking System*
