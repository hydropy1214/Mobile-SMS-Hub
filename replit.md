# SMS Control — Bulk SMS Campaign Manager

## Overview

A monorepo platform that turns Android phones into SMS gateways for bulk campaigns. Operators register devices, connect them by scanning a QR code with the **SMS Gateway app**, and run campaigns from the dashboard. The app dispatches messages automatically through the phone's native SIM.

## Architecture

| Layer | Package | Port | Preview path |
|---|---|---|---|
| API server (Express + WS) | `artifacts/api-server` | 8080 | `/api` |
| Dashboard (React + Vite) | `artifacts/sms-dashboard` | 21002 | `/` |
| SMS Gateway App (Expo) | `artifacts/sms-gateway-app` | 23579 | `/sms-gateway-app/` |
| DB schema (Drizzle + PostgreSQL) | `lib/db` | — | — |
| API spec (OpenAPI + Orval) | `lib/api-spec` / `lib/api-client-react` | — | — |

## How to run

Dependencies are managed with **pnpm workspaces**.

```bash
# Install all dependencies (run once after clone)
pnpm install

# Push DB schema to PostgreSQL (run once, or after schema changes)
pnpm --filter @workspace/db run push

# Start all services via Replit workflows (recommended)
# — or run individually:
pnpm --filter @workspace/api-server run dev       # API + WS server
pnpm --filter @workspace/sms-dashboard run dev    # Dashboard
pnpm --filter @workspace/sms-gateway-app run dev  # Expo mobile app
```

Replit workflows are pre-configured for all three services.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Auto-provisioned by Replit PostgreSQL |
| `PORT` | Yes | Set per-artifact by Replit |
| `SESSION_SECRET` | Yes | Express session signing key |
| `REPLIT_DEV_DOMAIN` | Auto | Used to build QR code connect URLs |

## How to connect a device

1. **Register** — Dashboard → Devices → **Register Device** (enter name, phone number, SIM slot)
2. **Get the app** — Install **Expo Go** on the Android phone (Google Play), then open the SMS Gateway app preview from the Replit preview tab
3. **Connect** — Dashboard → Devices → **Connect** button → a QR code dialog appears
4. **Scan** — In the SMS Gateway app the camera opens automatically; point it at the QR code
5. **Done** — the device goes Online and starts dispatching messages automatically

The connect QR code encodes:
```
https://<server>/mobile?deviceId=<id>&token=<bearer-token>
```
The SMS Gateway app parses this URL, validates the token against `/api/native/v1/messages`, then opens a WebSocket + polling session.

## SMS dispatch flow

1. Campaign processor (`campaign-processor.ts`) ticks every 3 s, picks queued messages, marks them `dispatched`, and pushes them to connected devices via WebSocket (`sms:dispatch` event)
2. The SMS Gateway app receives the push (or polls `/api/native/v1/messages` as fallback every 4 s)
3. App opens the native Android SMS composer pre-filled with phone + message
4. User taps **Send** (or selects SIM on dual-SIM devices)
5. App PATCHes `/api/native/v1/messages/:id` with `{ status: "sent" | "failed" }`
6. Dashboard updates in real time via WebSocket

## SIM card handling

Each device has an optional `simSlot` (0 = SIM 1, 1 = SIM 2, null = default). The app displays which SIM to use as a badge on the current message and shows a reminder inside the SMS composer screen.

## Key files

| File | Purpose |
|---|---|
| `artifacts/api-server/src/lib/campaign-processor.ts` | 3 s tick loop — dispatches messages to devices |
| `artifacts/api-server/src/lib/ws-server.ts` | WebSocket server — device registration, push dispatch |
| `artifacts/api-server/src/routes/native-gateway.ts` | REST endpoints for the mobile app (messages, heartbeat) |
| `artifacts/api-server/src/routes/devices.ts` | Device CRUD + connect URL / QR data generation |
| `artifacts/sms-dashboard/src/pages/devices.tsx` | Devices page + ConnectDialog (QR code shown here) |
| `artifacts/sms-gateway-app/context/GatewayContext.tsx` | All connection logic, polling, SMS dispatch, battery |
| `artifacts/sms-gateway-app/app/(tabs)/index.tsx` | Scanner → Connecting → Gateway screens |
| `lib/db/src/schema/` | Drizzle schema for all tables |

## User preferences

- Keep the project's existing monorepo structure and stack
