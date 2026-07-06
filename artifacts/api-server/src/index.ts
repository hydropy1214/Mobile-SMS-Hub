import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initWsServer } from "./lib/ws-server";
import { startCampaignProcessor } from "./lib/campaign-processor";
import { startDeviceMonitor } from "./lib/device-monitor";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);

initWsServer(server);

server.listen(port, () => {
  logger.info({ port }, "Server listening");
  startCampaignProcessor();
  startDeviceMonitor();
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
