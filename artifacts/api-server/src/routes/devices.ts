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

const router = Router();

// Never expose the internal token in list/get responses
function safeDevice(d: typeof devicesTable.$inferSelect) {
  return {
    id: d.id,
    name: d.name,
    phoneNumber: d.phoneNumber,
    status: d.status,
    batteryLevel: d.batteryLevel ?? null,
    signalStrength: d.signalStrength ?? null,
    lastSeen: d.lastSeen?.toISOString() ?? null,
    token: "[hidden]", // token is only exposed via the /connect endpoint
    createdAt: d.createdAt.toISOString(),
  };
}

// List devices
router.get("/devices", async (req, res) => {
  const devices = await db.select().from(devicesTable).orderBy(devicesTable.createdAt);
  res.json(devices.map(safeDevice));
});

// Create device
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
  // Return the real token on creation so the user can set up the device immediately
  res.status(201).json({ ...safeDevice(device), token: device.token });
});

// Get device
router.get("/devices/:id", async (req, res) => {
  const { id } = GetDeviceParams.parse({ id: Number(req.params.id) });
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(safeDevice(device));
});

// Delete device
router.delete("/devices/:id", async (req, res) => {
  const { id } = DeleteDeviceParams.parse({ id: Number(req.params.id) });
  await db.delete(devicesTable).where(eq(devicesTable.id, id));
  res.status(204).send();
});

// Heartbeat — requires token validation
router.patch("/devices/:id/heartbeat", async (req, res) => {
  const { id } = DeviceHeartbeatParams.parse({ id: Number(req.params.id) });
  const body = DeviceHeartbeatBody.parse(req.body);

  // Validate device token from query param or Authorization header
  const providedToken =
    (req.query.token as string | undefined) ??
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  const [existing] = await db.select({ token: devicesTable.token }).from(devicesTable).where(eq(devicesTable.id, id));
  if (!existing || !providedToken || existing.token !== providedToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [device] = await db
    .update(devicesTable)
    .set({
      status: (body.status as string) ?? "online",
      batteryLevel: body.batteryLevel ?? undefined,
      signalStrength: body.signalStrength ?? undefined,
      lastSeen: new Date(),
    })
    .where(eq(devicesTable.id, id))
    .returning();

  res.json(safeDevice(device));
});

// Connect info (QR code data) — only endpoint that returns real token
router.get("/devices/:id/connect", async (req, res) => {
  const { id } = GetDeviceConnectParams.parse({ id: Number(req.params.id) });
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const host = req.headers.host ?? "localhost";
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  // Token is passed in the Authorization header payload, not as a URL query param
  const connectUrl = `${proto}://${host}/api/devices/${id}/heartbeat`;
  const qrData = JSON.stringify({ deviceId: id, token: device.token, connectUrl });
  res.json({ token: device.token, connectUrl, qrData });
});

export default router;
