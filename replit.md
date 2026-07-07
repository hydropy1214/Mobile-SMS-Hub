# SMS Control — Bulk SMS Campaign Manager

## Overview
A monorepo platform that turns Android phones into SMS gateways for bulk campaigns. Operators register devices via QR code, manage contacts/lists, and run campaigns from a dashboard. The connected mobile page dispatches messages automatically.

## Architecture
| Layer | Package | Port | Path |
|---|---|---|---|
| API server | `artifacts/api-server` | 8080 | `/api` |
| Dashboard (React + Vite) | `artifacts/sms-dashboard` | 21002 | `/` |
| DB schema (Drizzle + PostgreSQL) | `lib/db` | — | — |
| API spec (OpenAPI + Orval codegen) | `lib/api-spec` / `lib/api-client-react` | — | — |

## How to run
Dependencies are managed with **pnpm workspaces**.

```bash
# Install all dependencies (run once after clone)
pnpm install

# Push DB schema to PostgreSQL
pnpm --filter @workspace/db run push

# Dev: start API server (rebuilds on each restart)
pnpm --filter @workspace/api-server run dev

# Dev: start dashboard
pnpm --filter @workspace/sms-dashboard run dev
```

Replit workflows are pre-configured for both services.

## Environment variables
| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Auto-provisioned by Replit PostgreSQL |
| `PORT` | Yes | Set per-artifact by Replit |
| `SESSION_SECRET` | Yes | Express session signing |
| `REPLIT_DEV_DOMAIN` | Auto | Used to build QR code URLs |

## Mobile gateway
- Navigate to `/mobile?deviceId=<id>&token=<token>` (encoded in the QR code shown in Devices page)
- The page connects via WebSocket + heartbeat polling
- When a campaign starts, SMS messages are dispatched automatically — the SMS app opens pre-filled for each message
- Screen wake lock keeps the device on
- No button taps needed in the dashboard; user only taps **Send** in the native SMS app

## Key files
- `artifacts/api-server/src/lib/campaign-processor.ts` — 3s tick loop that dispatches messages to connected devices
- `artifacts/api-server/src/lib/ws-server.ts` — WebSocket server, device registration, push dispatch
- `artifacts/api-server/src/routes/devices.ts` — heartbeat, pending-messages polling, QR connect URL
- `artifacts/sms-dashboard/src/pages/mobile.tsx` — auto-send gateway page
- `lib/db/src/schema/` — Drizzle schema for all tables

## User preferences
- Keep the project's existing monorepo structure and stack
