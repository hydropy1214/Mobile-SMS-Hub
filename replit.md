# SMS Control — Bulk SMS Dashboard

A bulk SMS campaign management platform. Operators register Android phones as SMS gateway devices (via QR code), build contact lists, and send campaigns through those devices. Real-time progress is delivered over WebSocket.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, mounted at `/api`)
- `pnpm --filter @workspace/sms-dashboard run dev` — run the React dashboard (port 21002, mounted at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (runtime-managed by Replit, do not set manually)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080, path `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle), Vite (frontend)
- Real-time: WebSocket at `/api/ws`

## Where things live

- `artifacts/api-server/` — Express API server, campaign processor, device monitor, WebSocket
- `artifacts/sms-dashboard/` — React/Vite dashboard (shadcn/ui, React Query, wouter)
- `lib/db/` — Drizzle schema + DB client (source of truth for data model)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-zod/src/generated/` — Zod schemas generated from OpenAPI spec
- `lib/api-client-react/src/generated/` — React Query hooks generated from OpenAPI spec

## Architecture decisions

- Campaign processor is a background `setInterval` loop (3s tick) that processes 5 messages per campaign per tick at a 96% simulated success rate. The processor and device monitor run in the same API server process.
- Devices register with a secret token; heartbeat calls must supply it via `Authorization: Bearer <token>`. The token is only returned at device creation and via `/devices/:id/connect` (QR setup).
- The mobile page (`/mobile?deviceId=N&token=T`) is a self-contained heartbeat agent — no dashboard chrome, just keeps the phone online and pings every 25s.
- API paths are all prefixed `/api` (enforced at Express app level). Frontend API calls use relative URLs starting with `/api/...`.
- Bulk send is wrapped in a DB transaction to prevent partial message queue / campaign state mismatch on failure.

## Product

- **Devices**: Register and manage Android phones as SMS gateways. Scan QR → open `/mobile` page → phone stays online.
- **Contacts**: Import contacts (CSV) or add individually. Organize into lists.
- **Campaigns**: Create a campaign targeting a contact list + device, set an optional schedule, then send or pause/cancel. Live progress via WebSocket.
- **Dashboard**: Mission control — devices online, messages sent today, active campaigns, 7-day message volume chart, activity feed.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `ws` package ESM wrapper does not export `OPEN` as a named export — use `WebSocket.OPEN` instead.
- `DATABASE_URL` is runtime-managed by Replit (`PGDATABASE`, `PGHOST`, etc. too). Do not set or request these manually.
- After schema changes: run `pnpm --filter @workspace/db run push` then restart the API server workflow.
- After OpenAPI spec changes: run `pnpm --filter @workspace/api-spec run codegen` to regenerate client hooks and Zod schemas.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
