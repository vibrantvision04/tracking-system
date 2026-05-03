# ISWM Jaipur Heritage — GPS Tracking System

Enterprise-grade GPS vehicle tracking and waste management system designed for Jaipur Heritage Municipal Corporation.

## 🏗️ Architecture

- **Backend (Go)**: High-performance TCP ingestion (Teltonika protocol), REST API, and WebSocket broadcaster.
- **Frontend (Next.js)**: Premium TypeScript dashboard with real-time tracking, playback, and automated reporting.
- **Database**: PostgreSQL for persistent data, Redis for real-time location caching.

## 🚀 Deployment

### Backend (Railway / VPS)
The backend is a Go application located in the root directory.
1. Configure `.env` with your DB and Redis credentials.
2. Build and run:
   ```bash
   go mod tidy
   go run cmd/server/main.go
   ```
3. Ports:
   - `5027`: GPS Device Data (TCP)
   - `8080`: REST API
   - `8081`: WebSockets

### Frontend (Vercel)
The frontend is a Next.js app located in the `/web` directory.
1. Go to the `web` folder: `cd web`
2. Install dependencies: `npm install`
3. Configure `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` in Vercel to point to your backend.
4. Deploy using `vercel` or connect to GitHub.

## 🛠️ Features
- **Live Tracking**: Real-time fleet movement via WebSockets.
- **Region Hierarchy**: Management of Zones and Wards.
- **Route Playback**: Historical movement replay for any date.
- **ISWM Reports**: Automated calculation of Active/Idle/Stoppage durations.
- **Alerts**: Overspeeding and unauthorized stoppage notifications.
