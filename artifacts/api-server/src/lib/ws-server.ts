import { WebSocketServer, type WebSocket, OPEN } from "ws";
import type { Server } from "http";
import { logger } from "./logger";

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function initWsServer(server: Server): void {
  wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (ws, req) => {
    clients.add(ws);
    logger.info({ clientsCount: clients.size }, "WS client connected");

    // Send welcome ping
    ws.send(JSON.stringify({ event: "connected", data: { message: "SMS Control WebSocket ready" }, ts: new Date().toISOString() }));

    ws.on("close", () => {
      clients.delete(ws);
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
    if (client.readyState === OPEN) {
      try {
        client.send(message);
      } catch {
        clients.delete(client);
      }
    }
  }
}
