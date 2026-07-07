import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, devicesTable, activityLogTable } from "@workspace/db";
import {
  CreateDeviceBody,
  DeviceHeartbeatBody,
  GetDeviceParams,
  DeleteDeviceParams,
  DeviceHeartbeatParams,
  GetDeviceConnectParams,
} from "@workspace/api-zod";
import { randomBytes } from "crypto";
import { broadcast } from "../lib/ws-server";

const router = Router();

/** Strip the internal token from device rows returned to the dashboard */
function safeDevice(d: typeof devicesTable.$inferSelect) {
  return {
    id: d.id,
    name: d.name,
    phoneNumber: d.phoneNumber,
    status: d.status,
    batteryLevel: d.batteryLevel ?? null,
    signalStrength: d.signalStrength ?? null,
    lastSeen: d.lastSeen?.toISOString() ?? null,
    token: "[hidden]",
    createdAt: d.createdAt.toISOString(),
  };
}

router.get("/devices", async (_req, res) => {
  const devices = await db.select().from(devicesTable).orderBy(devicesTable.createdAt);
  res.json(devices.map(safeDevice));
});

router.post("/devices", async (req, res) => {
  const body = CreateDeviceBody.parse(req.body);
  const token = randomBytes(24).toString("hex");
  const [device] = await db
    .insert(devicesTable)
    .values({ name: body.name, phoneNumber: body.phoneNumber, token, status: "offline" })
    .returning();

  await db.insert(activityLogTable).values({
    type: "device_connected",
    description: `Device "${body.name}" registered`,
    relatedId: device.id,
  });

  broadcast("device:registered", { deviceId: device.id, name: body.name });

  // Return real token on creation so dashboard can show the QR immediately
  res.status(201).json({ ...safeDevice(device), token: device.token });
});

router.get("/devices/:id", async (req, res) => {
  const { id } = GetDeviceParams.parse({ id: Number(req.params.id) });
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }
  res.json(safeDevice(device));
});

router.delete("/devices/:id", async (req, res) => {
  const { id } = DeleteDeviceParams.parse({ id: Number(req.params.id) });
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
  await db.delete(devicesTable).where(eq(devicesTable.id, id));
  if (device) {
    broadcast("device:removed", { deviceId: id, name: device.name });
  }
  res.status(204).send();
});

/**
 * Heartbeat — called by the mobile page every ~25 seconds.
 * Requires the device token via Authorization header OR ?token= query param.
 */
router.patch("/devices/:id/heartbeat", async (req, res) => {
  const { id } = DeviceHeartbeatParams.parse({ id: Number(req.params.id) });
  const body = DeviceHeartbeatBody.parse(req.body);

  const providedToken =
    (req.query.token as string | undefined) ??
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  const [existing] = await db
    .select({ token: devicesTable.token, name: devicesTable.name, status: devicesTable.status })
    .from(devicesTable)
    .where(eq(devicesTable.id, id));

  if (!existing || !providedToken || existing.token !== providedToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const wasOffline = existing.status === "offline";
  const newStatus = (body.status as string | null | undefined) ?? "online";

  const [device] = await db
    .update(devicesTable)
    .set({
      status: newStatus,
      batteryLevel: body.batteryLevel ?? undefined,
      signalStrength: body.signalStrength ?? undefined,
      lastSeen: new Date(),
    })
    .where(eq(devicesTable.id, id))
    .returning();

  if (wasOffline && newStatus === "online") {
    await db.insert(activityLogTable).values({
      type: "device_connected",
      description: `Device "${existing.name}" came back online`,
      relatedId: id,
    });
  }

  broadcast("device:status", {
    deviceId: id,
    name: device.name,
    status: device.status,
    batteryLevel: device.batteryLevel,
    signalStrength: device.signalStrength,
    lastSeen: device.lastSeen?.toISOString(),
  });

  res.json(safeDevice(device));
});

/**
 * Returns the mobile-page URL (what the QR code encodes) + the raw token.
 * This is the only endpoint that exposes the token.
 */
router.get("/devices/:id/connect", async (req, res) => {
  const { id } = GetDeviceConnectParams.parse({ id: Number(req.params.id) });
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  // Prefer REPLIT_DEV_DOMAIN (always the correct public domain on Replit).
  // Fall back to the forwarded host header for self-hosted deployments.
  const replitDomain = process.env["REPLIT_DEV_DOMAIN"];
  const proto = replitDomain
    ? "https"
    : ((req.headers["x-forwarded-proto"] as string | undefined) ?? "https");
  const host = replitDomain ?? (req.headers.host ?? "localhost");
  // QR code encodes the mobile-gateway page URL — what the phone opens
  const mobileUrl = `${proto}://${host}/mobile?deviceId=${id}&token=${device.token}`;

  res.json({
    token: device.token,
    connectUrl: mobileUrl,
    qrData: mobileUrl,
  });
});

export default router;
