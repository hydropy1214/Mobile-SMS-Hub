import { and, eq, lt, ne } from "drizzle-orm";
import { db, devicesTable, activityLogTable } from "@workspace/db";
import { broadcast } from "./ws-server";
import { logger } from "./logger";

const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL_MS = 30 * 1000; // check every 30 seconds

async function checkDevices() {
  try {
    const threshold = new Date(Date.now() - OFFLINE_THRESHOLD_MS);

    // Find online/idle devices whose lastSeen is older than threshold
    const stale = await db
      .select()
      .from(devicesTable)
      .where(and(ne(devicesTable.status, "offline"), lt(devicesTable.lastSeen, threshold)));

    for (const device of stale) {
      await db
        .update(devicesTable)
        .set({ status: "offline" })
        .where(eq(devicesTable.id, device.id));

      await db.insert(activityLogTable).values({
        type: "device_disconnected",
        description: `Device "${device.name}" went offline (heartbeat timeout)`,
        relatedId: device.id,
      });

      broadcast("device:offline", { deviceId: device.id, name: device.name });
      logger.info({ deviceId: device.id, name: device.name }, "Device marked offline (heartbeat timeout)");
    }
  } catch (err) {
    logger.error({ err }, "Device monitor error");
  }
}

export function startDeviceMonitor(): void {
  setInterval(() => { void checkDevices(); }, CHECK_INTERVAL_MS);
  logger.info({ checkIntervalMs: CHECK_INTERVAL_MS }, "Device monitor started");
}
