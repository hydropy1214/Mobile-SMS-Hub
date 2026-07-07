import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Allow CSV text body for bulk contact import
app.use(express.text({ type: "text/csv", limit: "10mb" }));

app.use("/api", router);

function isZodError(err: unknown): err is { name: "ZodError"; issues: unknown[] } {
  return (
    err !== null &&
    typeof err === "object" &&
    "name" in err &&
    (err as Record<string, unknown>)["name"] === "ZodError" &&
    "issues" in err &&
    Array.isArray((err as Record<string, unknown>)["issues"])
  );
}

// Centralized error handler — must be registered after all routes
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (isZodError(err)) {
    res.status(400).json({ error: "Invalid request", details: err.issues });
    return;
  }

  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
