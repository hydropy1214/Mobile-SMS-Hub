---
name: Dual-SIM and Connection Methods
description: How SIM slot selection, script generation, and ConnectDialog work in this project.
---

## SIM slot
- `sim_slot` column (integer, nullable) on `devices` table; 0 = SIM1, 1 = SIM2, null = device default.
- Validated strictly to 0|1|null in the route; any other number coerced to null.
- Passed from server to Termux daemon via `simSlot` field in the message JSON response (per-message override takes precedence over device default).
- `termux-sms-send -s $SIM_SLOT` — the `-s` flag selects the SIM slot.

## Dispatched-timeout
- Messages stuck in `dispatched` > 2 min are reset to `queued` by the campaign processor tick.
- Uses `dispatchedAt` column (set at queue→dispatched transition), NOT `createdAt`, to avoid reverting old messages immediately after dispatch.

## ConnectDialog — 6 tabs
1. **Termux** — bash daemon, continuous loop, downloads via `/api/native/v1/daemon/:token`
2. **Tasker** — Termux:Tasker plugin (NOT Tasker native shell); one-shot script placed in `~/.termux/tasker/`; script generated client-side via `buildOnceScript()`
3. **Browser** — QR code + URL, works on iOS and Android, manual tap
4. **Share Link** — WhatsApp / Telegram / Email / SMS / native navigator.share()
5. **Python** — cross-platform daemon; generated client-side via `buildPythonScript()` + `downloadBlob()` (token never in URL); default stub returns False to avoid silent mis-delivery
6. **API** — inline REST docs with the device token and curl examples

## Script generation pattern
- Bash scripts (daemon, once): generated server-side at `/api/native/v1/daemon/:token` and `/api/native/v1/once/:token` — token in URL is unavoidable for curl one-liners.
- Python script: generated client-side in `buildPythonScript()`, downloaded via `downloadBlob()` — no server endpoint needed, token never hits a URL or proxy log.
- `buildOnceScript()` and `buildPythonScript()` live in `artifacts/sms-dashboard/src/pages/devices.tsx`.

**Why:** Token-in-URL leaks to browser history, proxy logs, and server access logs. Client-side generation eliminates this for the Python download path. Bash scripts that must be curl'd to Android are inherently token-in-URL and are accepted as a design constraint.
