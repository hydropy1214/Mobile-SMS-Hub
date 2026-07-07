---
name: SMS Dispatch Architecture
description: How SMS campaigns are dispatched to physical Android devices via WebSocket push + HTTP polling fallback
---

## State machine (messages table `status` column)

`queued` → `dispatched` → `sent` (device confirmed) | `failed` (device offline)

- **queued**: message waiting for dispatch. Campaign processor claims these atomically.
- **dispatched**: atomic claim completed; WS push attempted. Stays dispatched until device confirms or WS flush on reconnect re-claims it.
- **sent**: device PATCH /messages/:id/confirm called after SMS app opened.
- **failed**: device was truly offline (lastSeen > 5 min OR status="offline").
- **delivered**: reserved for future carrier delivery reports.

## Two dispatch paths

### Fast path — WebSocket push
- `sendToDevice(deviceId, "sms:dispatch", payload)` in `ws-server.ts`
- Campaign processor and `flushQueuedMessages()` both use it
- On WS push success: leave as "dispatched" (mobile page confirms → "sent")
- On WS push failure + device offline: immediately fail
- On WS push failure + device online: revert to "queued" (mobile page polling picks it up)

### Fallback path — HTTP polling
- Mobile page polls `GET /api/devices/:id/pending-messages` every 5s
- Endpoint returns both "queued" AND "dispatched" messages
- Mobile page deduplicates by messageId
- User taps "Open SMS App" per message; confirmed via PATCH /messages/:id/confirm

## Atomic claiming (race-condition prevention)
```typescript
const claimed = await db.update(messagesTable)
  .set({ status: "dispatched" })
  .where(and(inArray(messagesTable.id, ids), eq(messagesTable.status, "queued")))
  .returning();
```
Only rows still "queued" are claimed. Concurrent callers are safe.

## WS reconnect flush
When device WS registers (`registerDevice`): `flushQueuedMessages()` atomically claims queued+dispatched → WS-pushes immediately.

## Campaign completion
Campaign completes when zero rows have status "queued" OR "dispatched" for that campaign.

## Auth
- Device token: only via `Authorization: Bearer <token>` header (no `?token=` query param — URL log exposure risk).
- Token returned only via `GET /api/devices/:id/connect` (dashboard, already authenticated).

## Key finding
Root cause of original failure: campaign processor immediately marked messages "failed" when WS not connected, even if device was online. Fixed by leaving as "queued" when device is online but WS disconnected.

**Why:** WS connections on Replit are ephemeral (can disconnect/reconnect within seconds). Failing immediately on WS disconnect caused all messages to fail whenever WS happened to drop at the moment of campaign launch.
