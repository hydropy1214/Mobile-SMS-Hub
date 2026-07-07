/**
 * Native Gateway API — used by the Termux daemon script running on the Android device.
 * Provides a simple pull-based JSON API so the phone can fetch pending messages
 * and report send results without any browser or user interaction.
 *
 * Auth: Bearer <device-token>  OR  ?token=<device-token> query param.
 */
import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  devicesTable,
  messagesTable,
  campaignsTable,
  activityLogTable,
} from "@workspace/db";
import { broadcast } from "../lib/ws-server";

const router = Router();

/** Resolve a device from the token in the Authorization header or ?token= query param. */
async function authDevice(req: {
  query: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}): Promise<typeof devicesTable.$inferSelect | null> {
  const token =
    (req.query["token"] as string | undefined) ??
    (req.headers["authorization"] as string | undefined)?.replace(/^Bearer\s+/i, "");

  if (!token) return null;

  const [device] = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.token, token));

  return device ?? null;
}

/**
 * GET /api/native/v1/messages
 *
 * Returns all queued / dispatched messages assigned to this device.
 * Also bumps the device heartbeat so it shows "online" in the dashboard.
 */
router.get("/native/v1/messages", async (req, res) => {
  const device = await authDevice(req);
  if (!device) { res.status(401).json({ error: "Unauthorized" }); return; }

  const wasOffline = device.status === "offline";

  await db
    .update(devicesTable)
    .set({ status: "online", lastSeen: new Date() })
    .where(eq(devicesTable.id, device.id));

  if (wasOffline) {
    await db.insert(activityLogTable).values({
      type: "device_connected",
      description: `Device "${device.name}" came back online`,
      relatedId: device.id,
    });
  }

  broadcast("device:status", {
    deviceId: device.id,
    name: device.name,
    status: "online",
    lastSeen: new Date().toISOString(),
  });

  const pending = await db
    .select()
    .from(messagesTable)
    .where(and(
      eq(messagesTable.deviceId, device.id),
      inArray(messagesTable.status, ["queued", "dispatched"]),
    ));

  res.json(
    pending.map((m) => ({
      id: m.id,
      phoneNumber: m.phoneNumber,
      messageText: m.messageText,
      simSlot: device.simSlot ?? null,
    })),
  );
});

/**
 * PATCH /api/native/v1/messages/:id
 * Body: { "status": "sent" | "failed" }
 *
 * Called by the Termux daemon after each SMS is sent (or fails).
 * Updates the message row and recalculates campaign progress.
 */
router.patch("/native/v1/messages/:id", async (req, res) => {
  const device = await authDevice(req);
  if (!device) { res.status(401).json({ error: "Unauthorized" }); return; }

  const msgId = Number(req.params.id);
  if (isNaN(msgId)) { res.status(400).json({ error: "Invalid message id" }); return; }

  const status: unknown = req.body?.status;
  if (status !== "sent" && status !== "failed") {
    res.status(400).json({ error: "status must be 'sent' or 'failed'" });
    return;
  }

  const [msg] = await db
    .select()
    .from(messagesTable)
    .where(and(eq(messagesTable.id, msgId), eq(messagesTable.deviceId, device.id)));

  if (!msg) { res.status(404).json({ error: "Message not found" }); return; }

  // Skip if already in a terminal state (idempotent)
  if (msg.status === "sent" || msg.status === "failed") {
    res.json({ id: msg.id, status: msg.status });
    return;
  }

  const [updated] = await db
    .update(messagesTable)
    .set({ status, sentAt: status === "sent" ? new Date() : null })
    .where(eq(messagesTable.id, msgId))
    .returning();

  // Recalculate campaign counters and check for completion
  const [campaign] = msg.campaignId
    ? await db.select().from(campaignsTable).where(eq(campaignsTable.id, msg.campaignId))
    : [];

  if (campaign && campaign.status === "sending") {
    const newSentCount   = status === "sent"   ? campaign.sentCount   + 1 : campaign.sentCount;
    const newFailedCount = status === "failed" ? campaign.failedCount + 1 : campaign.failedCount;
    const isDone = newSentCount + newFailedCount >= campaign.totalCount;

    await db
      .update(campaignsTable)
      .set({
        sentCount: newSentCount,
        failedCount: newFailedCount,
        ...(isDone ? { status: "completed", completedAt: new Date() } : {}),
      })
      .where(eq(campaignsTable.id, campaign.id));

    broadcast("campaign:progress", {
      campaignId: campaign.id,
      sentCount: newSentCount,
      failedCount: newFailedCount,
      totalCount: campaign.totalCount,
    });

    if (isDone) {
      broadcast("campaign:completed", { campaignId: campaign.id });
      await db.insert(activityLogTable).values({
        type: "campaign_completed",
        description: `Campaign "${campaign.name}" completed — ${newSentCount}/${campaign.totalCount} sent`,
        relatedId: campaign.id,
      });
    }
  }

  res.json({ id: updated.id, status: updated.status });
});

/**
 * POST /api/native/v1/heartbeat
 * Body: { "batteryLevel"?: number, "signalStrength"?: number }
 *
 * Optional heartbeat endpoint so the daemon can update battery / signal info
 * without triggering a full message fetch.
 */
router.post("/native/v1/heartbeat", async (req, res) => {
  const device = await authDevice(req);
  if (!device) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { batteryLevel, signalStrength } = (req.body ?? {}) as Record<string, unknown>;

  const updates: Partial<typeof devicesTable.$inferInsert> = {
    status: "online",
    lastSeen: new Date(),
  };
  if (typeof batteryLevel === "number")   updates.batteryLevel   = batteryLevel;
  if (typeof signalStrength === "number") updates.signalStrength = signalStrength;

  const [updated] = await db
    .update(devicesTable)
    .set(updates)
    .where(eq(devicesTable.id, device.id))
    .returning();

  broadcast("device:status", {
    deviceId: device.id,
    name: device.name,
    status: "online",
    batteryLevel: updated.batteryLevel,
    signalStrength: updated.signalStrength,
    lastSeen: updated.lastSeen?.toISOString(),
  });

  res.json({ ok: true });
});

/**
 * GET /api/native/v1/daemon/:token
 *
 * Serves the ready-to-run Termux bash daemon script with the token and
 * server URL already embedded. The one-liner in the dashboard is:
 *   curl -o sms-daemon.sh '<url>/api/native/v1/daemon/<token>' && bash sms-daemon.sh
 */
router.get("/native/v1/daemon/:token", async (req, res) => {
  const token = req.params.token;
  const [device] = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(eq(devicesTable.token, token));

  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  const replitDomain = process.env["REPLIT_DEV_DOMAIN"];
  const proto = replitDomain ? "https" : ((req.headers["x-forwarded-proto"] as string | undefined) ?? "https");
  const host  = replitDomain ?? (req.headers.host ?? "localhost");
  const serverOrigin = `${proto}://${host}`;

  // Fetch the device's simSlot so we can embed it in the script
  const [deviceRow] = await db
    .select({ simSlot: devicesTable.simSlot })
    .from(devicesTable)
    .where(eq(devicesTable.token, token));

  const simSlotLine = (deviceRow?.simSlot != null)
    ? `SIM_SLOT=${deviceRow.simSlot}   # 0=SIM1 1=SIM2 — change to override`
    : `SIM_SLOT=""         # empty = use device default SIM`;

  const sendCmd = (deviceRow?.simSlot != null)
    ? `termux-sms-send -s $SIM_SLOT -n "$PHONE" "$TEXT"`
    : `termux-sms-send -n "$PHONE" "$TEXT"`;

  const script = `#!/data/data/com.termux/files/usr/bin/bash
# ─────────────────────────────────────────────────────────
#  SMS Control — Termux Auto-Send Daemon
#  Sends SMS automatically via your SIM — no tap needed.
#
#  Requirements (run once):
#    pkg install termux-api jq -y
#    termux-setup-storage   ← grant SMS permission when asked
# ─────────────────────────────────────────────────────────

SERVER="${serverOrigin}"
TOKEN="${token}"
POLL_INTERVAL=4   # seconds between polls
${simSlotLine}

echo "🚀 SMS Gateway daemon started"
echo "   Server : $SERVER"
echo "   SIM    : \${SIM_SLOT:-default}"
echo "   Press Ctrl+C to stop"
echo ""

while true; do
  RESPONSE=$(curl -sf \\
    -H "Authorization: Bearer $TOKEN" \\
    "$SERVER/api/native/v1/messages" 2>/dev/null)

  if [ $? -ne 0 ]; then
    echo "$(date '+%H:%M:%S') ⚠ Server unreachable — retrying in \${POLL_INTERVAL}s"
    sleep $POLL_INTERVAL
    continue
  fi

  COUNT=$(echo "$RESPONSE" | jq 'length' 2>/dev/null || echo 0)

  if [ "$COUNT" -gt 0 ]; then
    echo "$(date '+%H:%M:%S') 📨 $COUNT message(s) to send"

    echo "$RESPONSE" | jq -c '.[]' | while read -r msg; do
      ID=$(echo "$msg" | jq -r '.id')
      PHONE=$(echo "$msg" | jq -r '.phoneNumber')
      TEXT=$(echo "$msg" | jq -r '.messageText')
      # Use per-message simSlot if server provided one, otherwise fall back to script default
      MSG_SIM=$(echo "$msg" | jq -r '.simSlot // empty')
      ACTIVE_SIM=\${MSG_SIM:-\$SIM_SLOT}

      echo "$(date '+%H:%M:%S') → Sending to $PHONE (SIM: \${ACTIVE_SIM:-default}) …"

      SEND_ERR=$(mktemp)
      if [ -n "\$ACTIVE_SIM" ]; then
        termux-sms-send -s "\$ACTIVE_SIM" -n "$PHONE" "$TEXT" 2>"\$SEND_ERR"
      else
        termux-sms-send -n "$PHONE" "$TEXT" 2>"\$SEND_ERR"
      fi
      SEND_EXIT=$?
      rm -f "\$SEND_ERR"

      if [ $SEND_EXIT -eq 0 ]; then
        STATUS="sent"
        echo "$(date '+%H:%M:%S') ✓ Sent   #$ID → $PHONE"
      else
        STATUS="failed"
        echo "$(date '+%H:%M:%S') ✗ Failed #$ID → $PHONE (exit \$SEND_EXIT)"
      fi

      curl -sf -X PATCH \\
        -H "Authorization: Bearer $TOKEN" \\
        -H "Content-Type: application/json" \\
        -d "{\\"status\\":\\"$STATUS\\"}" \\
        "$SERVER/api/native/v1/messages/$ID" > /dev/null 2>&1

      sleep 2
    done
  fi

  sleep $POLL_INTERVAL
done
`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="sms-daemon.sh"');
  res.send(script);
});

/**
 * GET /api/native/v1/once/:token
 *
 * One-shot polling script — fetches pending messages, sends them, then exits.
 * Designed to be called by Tasker, cron, or any scheduler every ~30 seconds.
 * Unlike the daemon script this does NOT loop; the caller handles repetition.
 */
router.get("/native/v1/once/:token", async (req, res) => {
  const token = req.params.token;
  const [device] = await db
    .select({ id: devicesTable.id, simSlot: devicesTable.simSlot })
    .from(devicesTable)
    .where(eq(devicesTable.token, token));

  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  const replitDomain = process.env["REPLIT_DEV_DOMAIN"];
  const proto = replitDomain ? "https" : ((req.headers["x-forwarded-proto"] as string | undefined) ?? "https");
  const host  = replitDomain ?? (req.headers.host ?? "localhost");
  const serverOrigin = `${proto}://${host}`;

  const simSlotLine = device.simSlot != null
    ? `SIM_SLOT=${device.simSlot}`
    : `SIM_SLOT=""`;

  const script = `#!/data/data/com.termux/files/usr/bin/bash
# SMS Control — One-Shot Poll (run once per Tasker trigger)
# Requirements: pkg install termux-api jq -y

SERVER="${serverOrigin}"
TOKEN="${token}"
${simSlotLine}

RESPONSE=$(curl -sf -H "Authorization: Bearer $TOKEN" "$SERVER/api/native/v1/messages" 2>/dev/null)
[ $? -ne 0 ] && exit 1

echo "$RESPONSE" | jq -c '.[]' 2>/dev/null | while read -r msg; do
  ID=$(echo "$msg" | jq -r '.id')
  PHONE=$(echo "$msg" | jq -r '.phoneNumber')
  TEXT=$(echo "$msg" | jq -r '.messageText')
  MSG_SIM=$(echo "$msg" | jq -r '.simSlot // empty')
  ACTIVE_SIM=\${MSG_SIM:-\$SIM_SLOT}

  if [ -n "\$ACTIVE_SIM" ]; then
    termux-sms-send -s "\$ACTIVE_SIM" -n "$PHONE" "$TEXT" 2>/dev/null; RC=$?
  else
    termux-sms-send -n "$PHONE" "$TEXT" 2>/dev/null; RC=$?
  fi

  STATUS=$([ $RC -eq 0 ] && echo sent || echo failed)
  curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
    -d "{\\"status\\":\\"$STATUS\\"}" "$SERVER/api/native/v1/messages/$ID" >/dev/null 2>&1
  sleep 1
done
`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="sms-once.sh"');
  res.send(script);
});

/**
 * GET /api/native/v1/python-daemon/:token
 *
 * Cross-platform Python 3 daemon script — works on Windows, macOS, Linux.
 * Users plug in their own SMS sending logic (USB modem, GSM API, etc.)
 * or use it as a bridge to a local SMS gateway.
 */
router.get("/native/v1/python-daemon/:token", async (req, res) => {
  const token = req.params.token;
  const [device] = await db
    .select({ id: devicesTable.id, simSlot: devicesTable.simSlot })
    .from(devicesTable)
    .where(eq(devicesTable.token, token));

  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  const replitDomain = process.env["REPLIT_DEV_DOMAIN"];
  const proto = replitDomain ? "https" : ((req.headers["x-forwarded-proto"] as string | undefined) ?? "https");
  const host  = replitDomain ?? (req.headers.host ?? "localhost");
  const serverOrigin = `${proto}://${host}`;

  const simSlot = device.simSlot;

  const script = `#!/usr/bin/env python3
"""
SMS Control — Python Daemon
Cross-platform (Windows / macOS / Linux).  Runs continuously, polling for
pending messages and dispatching them through your chosen SMS backend.

Requirements:
    pip install requests

Usage:
    python3 sms-daemon.py

Edit the send_sms() function below to integrate your SMS hardware or API.
"""

import time
import sys
import requests

SERVER   = "${serverOrigin}"
TOKEN    = "${token}"
SIM_SLOT = ${simSlot != null ? String(simSlot) : "None"}   # None = device default; 0 = SIM1, 1 = SIM2
POLL_INTERVAL = 4  # seconds

_headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}


# ── Implement your SMS backend here ──────────────────────────────────────────

def send_sms(phone: str, text: str, sim_slot) -> bool:
    """
    Return True if the message was sent, False on failure.

    Choose ONE of the options below and uncomment it.

    ── Option A: USB / Bluetooth GSM modem (AT commands) ────────────────────
    import serial, time
    try:
        with serial.Serial('/dev/ttyUSB0', 115200, timeout=5) as s:  # adjust port
            s.write(b'AT+CMGF=1\\r'); time.sleep(0.3)
            s.write(f'AT+CMGS="{phone}"\\r'.encode()); time.sleep(0.3)
            s.write(text.encode() + b'\\x1a'); time.sleep(4)
        return True
    except Exception as e:
        print(f"  Modem error: {e}"); return False

    ── Option B: Gammu / python-gammu ───────────────────────────────────────
    import gammu
    sm = gammu.StateMachine()
    sm.ReadConfig(); sm.Init()
    sm.SendSMS({"Text": text, "SMSC": {"Location": 1}, "Number": phone})
    return True

    ── Option C: Africa's Talking API ───────────────────────────────────────
    import africastalking
    africastalking.initialize('username', 'api_key')
    sms = africastalking.SMS
    sms.send(text, [phone])
    return True

    ── Option D: Twilio ──────────────────────────────────────────────────────
    from twilio.rest import Client
    Client('ACCOUNT_SID', 'AUTH_TOKEN').messages.create(
        body=text, from_='+1234567890', to=phone)
    return True
    """
    # Default: print to terminal (replace with a real implementation above)
    print(f"  [STUB] Would send to {phone}: {text[:60]!r}")
    return True   # ← change to False if you want messages marked as failed


# ── Daemon loop ───────────────────────────────────────────────────────────────

def main():
    print("🚀 SMS Control Python daemon started")
    print(f"   Server  : {SERVER}")
    print(f"   SIM slot: {SIM_SLOT if SIM_SLOT is not None else 'device default'}")
    print("   Press Ctrl+C to stop\\n")

    while True:
        try:
            r = requests.get(
                f"{SERVER}/api/native/v1/messages",
                headers=_headers, timeout=15,
            )
            r.raise_for_status()
            messages = r.json()

            if messages:
                ts = time.strftime("%H:%M:%S")
                print(f"[{ts}] 📨 {len(messages)} message(s) to send")

                for msg in messages:
                    msg_id = msg["id"]
                    phone  = msg["phoneNumber"]
                    text   = msg.get("messageText") or ""
                    slot   = msg.get("simSlot")
                    if slot is None:
                        slot = SIM_SLOT

                    ts = time.strftime("%H:%M:%S")
                    print(f"[{ts}] → {phone} (SIM: {slot if slot is not None else 'default'})…")

                    try:
                        ok = send_sms(phone, text, slot)
                        status = "sent" if ok else "failed"
                    except Exception as exc:
                        status = "failed"
                        print(f"  Error: {exc}")

                    try:
                        requests.patch(
                            f"{SERVER}/api/native/v1/messages/{msg_id}",
                            json={"status": status},
                            headers=_headers, timeout=10,
                        )
                    except Exception:
                        pass

                    icon = "✓" if status == "sent" else "✗"
                    print(f"[{time.strftime('%H:%M:%S')}] {icon} {status.capitalize()} #{msg_id} → {phone}")
                    time.sleep(2)

        except KeyboardInterrupt:
            print("\\nDaemon stopped.")
            sys.exit(0)
        except requests.exceptions.ConnectionError:
            print(f"[{time.strftime('%H:%M:%S')}] ⚠  Server unreachable — retrying…")
        except Exception as exc:
            print(f"[{time.strftime('%H:%M:%S')}] ⚠  {exc}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="sms-daemon.py"');
  res.send(script);
});

export default router;
