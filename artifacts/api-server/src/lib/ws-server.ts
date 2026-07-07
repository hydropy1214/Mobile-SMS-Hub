import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { eq, and, inArray } from "drizzle-orm";
import { db, devicesTable, messagesTable } from "@workspace/db";
import { logger } from "./logger";

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

/** deviceId → authenticated WebSocket connection for that physical device */
const deviceClients = new Map<number, WebSocket>();

export function getConnectedDeviceIds(): number[] {
  return [...deviceClients.keys()];
}

/**
 * Send an event to a specific registered device connection.
 * Returns true only if the message was actually written to an open socket.
 */
export function sendToDevice(deviceId: number, event: string, data: unknown): boolean {
  const client = deviceClients.get(deviceId);
  if (!client || client.readyState !== WebSocket.OPEN) return false;
  try {
    client.send(JSON.stringify({ event, data, ts: new Date().toISOString() }));
    return true;
  } catch {
    deviceClients.delete(deviceId);
    clients.delete(client);
    return false;
  }
}

/**
 * On device WS registration, atomically claim all queued/dispatched messages
 * for this device and push them via the newly-opened socket.
 * The "queued → dispatched" transition uses a status guard in the UPDATE so
 * only one concurrent writer wins each row.
 */
async function flushQueuedMessages(deviceId: number): Promise<void> {
  try {
    // Atomically claim: queued → dispatched (and re-dispatch any already-dispatched that lost their socket)
    const claimed = await db
      .update(messagesTable)
      .set({ status: "dispatched" })
      .where(and(
        eq(messagesTable.deviceId, deviceId),
        inArray(messagesTable.status, ["queued", "dispatched"]),
      ))
      .returning();

    if (claimed.length === 0) return;
    logger.info({ deviceId, count: claimed.length }, "Flushing messages to newly-registered device");

    for (const msg of claimed) {
      const sent = sendToDevice(deviceId, "sms:dispatch", {
        messageId: msg.id,
        campaignId: msg.campaignId,
        phoneNumber: msg.phoneNumber,
        messageText: msg.messageText ?? "",
      });
      // If the socket closed between registration and flush, revert to queued
      if (!sent) {
        await db
          .update(messagesTable)
          .set({ status: "queued" })
          .where(eq(messagesTable.id, msg.id));
        logger.warn({ messageId: msg.id }, "Socket closed during flush; reverted to queued");
      }
    }
  } catch (err) {
    logger.error({ err, deviceId }, "flushQueuedMessages error");
  }
}

async function registerDevice(ws: WebSocket, deviceId: number, token: string): Promise<void> {
  try {
    const [device] = await db
      .select({ id: devicesTable.id, token: devicesTable.token })
      .from(devicesTable)
      .where(eq(devicesTable.id, deviceId));

    if (!device || device.token !== token) {
      ws.send(JSON.stringify({
        event: "device:register:error",
        data: { message: "Invalid device credentials" },
        ts: new Date().toISOString(),
      }));
      return;
    }

    deviceClients.set(deviceId, ws);
    ws.send(JSON.stringify({
      event: "device:register:ok",
      data: { deviceId },
      ts: new Date().toISOString(),
    }));
    logger.info({ deviceId }, "Device registered on WebSocket");

    // Immediately flush pending messages to this newly-connected device
    await flushQueuedMessages(deviceId);
  } catch (err) {
    logger.error({ err, deviceId }, "Device WS registration failed");
  }
}

export function initWsServer(server: Server): void {
  wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (ws) => {
    clients.add(ws);
    logger.info({ clientsCount: clients.size }, "WS client connected");

    ws.send(JSON.stringify({
      event: "connected",
      data: { message: "SMS Control WebSocket ready" },
      ts: new Date().toISOString(),
    }));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { event?: string; deviceId?: unknown; token?: unknown };
        if (
          msg.event === "device:register" &&
          typeof msg.deviceId === "number" &&
          typeof msg.token === "string"
        ) {
          void registerDevice(ws, msg.deviceId, msg.token);
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on("close", () => {
      clients.delete(ws);
      for (const [id, client] of deviceClients.entries()) {
        if (client === ws) {
          deviceClients.delete(id);
          logger.info({ deviceId: id }, "Device WS connection closed");
          break;
        }
      }
      logger.info({ clientsCount: clients.size }, "WS client disconnected");
    });

    ws.on("error", (err) => {
      logger.error({ err }, "WS client error");
      clients.delete(ws);
    });
  });

  logger.info("WebSocket server initialised at /api/ws");
}

export function broadcast(event: string, data: unknown): void {
  if (!wss) return;
  const message = JSON.stringify({ event, data, ts: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(message); }
      catch { clients.delete(client); }
    }
  }
}
