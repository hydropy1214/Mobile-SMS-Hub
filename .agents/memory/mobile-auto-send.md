---
name: Mobile Auto-Send Gateway
description: How the mobile page auto-processes SMS without user button taps, and the key design decisions made.
---

# Mobile Auto-Send Gateway

## The rule
The mobile page (`artifacts/sms-dashboard/src/pages/mobile.tsx`) auto-processes its SMS queue sequentially without requiring any button taps. When a message arrives it fires the `sms:` URI scheme deep-link automatically.

**Why:** User wanted "no interaction on mobile" — just keep the page open and messages send themselves.

## How it works
1. Messages arrive via WebSocket push (`sms:dispatch` event) or HTTP polling (`/api/devices/:id/pending-messages` every 4s)
2. `processNext()` picks the next `queued` item, marks it `sending`, calls `openSmsApp()` (sms: URI hidden anchor trick)
3. After `SMS_CONFIRM_DELAY_MS` (10s), confirms the message as `sent` to the API
4. Removes the item from UI after 3s, then immediately checks for the next one
5. `processingRef` (boolean ref) is the single-flight guard — prevents parallel processing

## Key guards
- `mountedRef.current` checked at every async step to prevent stale state updates after unmount
- `processingRef.current` prevents parallel invocations of `processNext()`
- Wake Lock re-acquired on `visibilitychange` only when `!current || current.released` (inverted check was a bug in v1)
- Wake Lock sentinel released on unmount via cleanup function

## Important limits
- Browsers cannot send SMS silently — `sms:` URI only pre-fills the SMS app. User must tap **Send** in the native SMS app. The 10s delay is the window for that tap.
- Android 10+ blocks auto-send via SMS intents from any source, so this is the deepest automation possible from a browser.
- Wake Lock may be unavailable (HTTPS required, user permission, some browsers)
