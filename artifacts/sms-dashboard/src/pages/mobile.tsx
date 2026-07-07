import { useEffect, useState, useRef, useCallback } from "react";
import {
  Smartphone,
  Wifi,
  WifiOff,
  Battery,
  Signal,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  MessageSquare,
  Send,
} from "lucide-react";

const HEARTBEAT_INTERVAL_MS = 25_000; // 25 seconds

interface DeviceInfo {
  deviceId: number;
  token: string;
}

interface SmsDispatch {
  messageId: number;
  campaignId: number;
  phoneNumber: string;
  messageText: string;
  openedAt?: number;
}

type ConnectionStatus = "connecting" | "connected" | "error" | "invalid";

function parseParams(): DeviceInfo | null {
  const params = new URLSearchParams(window.location.search);
  const deviceId = params.get("deviceId");
  const token = params.get("token");
  if (!deviceId || !token || isNaN(Number(deviceId))) return null;
  return { deviceId: Number(deviceId), token };
}

async function sendHeartbeat(
  info: DeviceInfo,
  battery: number | null,
  signal: number | null,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/devices/${info.deviceId}/heartbeat`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${info.token}`,
      },
      body: JSON.stringify({
        status: "online",
        batteryLevel: battery,
        signalStrength: signal,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function confirmMessage(
  info: DeviceInfo,
  messageId: number,
  status: "sent" | "failed",
): Promise<void> {
  try {
    await fetch(`/api/messages/${messageId}/confirm`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${info.token}`,
      },
      body: JSON.stringify({ status }),
    });
  } catch {
    // best-effort
  }
}

function getBatteryLevel(): Promise<number | null> {
  return new Promise((resolve) => {
    if ("getBattery" in navigator) {
      (navigator as unknown as { getBattery: () => Promise<{ level: number }> })
        .getBattery()
        .then((bat) => resolve(Math.round(bat.level * 100)))
        .catch(() => resolve(null));
    } else {
      resolve(null);
    }
  });
}

function getSignalStrength(): number | null {
  const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
  if (!conn) return null;
  const map: Record<string, number> = { "slow-2g": 1, "2g": 2, "3g": 3, "4g": 4 };
  return conn.effectiveType ? (map[conn.effectiveType] ?? null) : null;
}

function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws`;
}

export default function MobilePage() {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [wsConnected, setWsConnected] = useState(false);
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [signal, setSignal] = useState<number | null>(null);
  const [pingCount, setPingCount] = useState(0);
  const [smsQueue, setSmsQueue] = useState<SmsDispatch[]>([]);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const infoRef = useRef<DeviceInfo | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Open the SMS app for a queued message, then confirm after a short delay
  const processSms = useCallback(async (msg: SmsDispatch) => {
    const info = infoRef.current;
    if (!info) return;

    setProcessingId(msg.messageId);

    // Build the SMS intent URI — Android and iOS will open the native SMS app
    const smsUri = `sms:${encodeURIComponent(msg.phoneNumber)}?body=${encodeURIComponent(msg.messageText)}`;
    window.location.href = smsUri;

    // Wait briefly then confirm sent (best-effort; user may have tapped Send)
    await new Promise((r) => setTimeout(r, 6000));
    await confirmMessage(info, msg.messageId, "sent");

    setSmsQueue((q) => q.filter((m) => m.messageId !== msg.messageId));
    setProcessingId(null);
  }, []);

  // Auto-process the next queued message whenever the queue changes and we're idle
  useEffect(() => {
    if (processingId !== null) return;
    const next = smsQueue.find((m) => m.openedAt === undefined);
    if (!next) return;

    // Mark as in-progress immediately so this effect doesn't fire again
    setSmsQueue((q) =>
      q.map((m) => (m.messageId === next.messageId ? { ...m, openedAt: Date.now() } : m)),
    );
    void processSms(next);
  }, [smsQueue, processingId, processSms]);

  // Establish WebSocket and register as device
  useEffect(() => {
    const info = parseParams();
    if (!info) {
      setStatus("invalid");
      return;
    }
    infoRef.current = info;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        // Register this browser as the gateway for this device
        ws.send(
          JSON.stringify({
            event: "device:register",
            deviceId: info!.deviceId,
            token: info!.token,
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { event: string; data: unknown };

          if (msg.event === "sms:dispatch") {
            const d = msg.data as SmsDispatch;
            setSmsQueue((q) => {
              // Avoid duplicates
              if (q.some((m) => m.messageId === d.messageId)) return q;
              return [...q, d];
            });
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  // Heartbeat loop — keeps device status "online" in the database
  useEffect(() => {
    const info = infoRef.current;
    if (!info) return;

    async function ping() {
      const bat = await getBatteryLevel();
      const sig = getSignalStrength();
      setBattery(bat);
      setSignal(sig);
      const ok = await sendHeartbeat(info!, bat, sig);
      if (ok) {
        setStatus("connected");
        setLastPing(new Date());
        setPingCount((n) => n + 1);
      } else {
        setStatus("error");
      }
    }

    void ping();
    const interval = setInterval(() => {
      void ping();
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  if (status === "invalid") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center text-white max-w-xs">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Invalid Link</h1>
          <p className="text-gray-400 text-sm">
            This connection link is missing required parameters. Please scan the QR code again from
            the SMS Control dashboard.
          </p>
        </div>
      </div>
    );
  }

  const pendingCount = smsQueue.filter((m) => m.openedAt === undefined).length;
  const processingMsg = smsQueue.find((m) => m.messageId === processingId);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-start p-6 pt-10">
      {/* Brand */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
          <Smartphone className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">SMS Control</h1>
        <p className="text-gray-400 text-sm mt-1">Mobile Gateway Agent</p>
      </div>

      {/* Connection status card */}
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-4">
        <div className="flex items-center gap-3 mb-5">
          {status === "connecting" && (
            <>
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              <span className="text-blue-400 font-semibold">Connecting…</span>
            </>
          )}
          {status === "connected" && (
            <>
              <CheckCircle2 className="w-6 h-6 text-green-400" />
              <span className="text-green-400 font-semibold">Connected & Active</span>
            </>
          )}
          {status === "error" && (
            <>
              <WifiOff className="w-6 h-6 text-red-400" />
              <span className="text-red-400 font-semibold">Connection Failed</span>
            </>
          )}
          <div
            className={`ml-auto w-3 h-3 rounded-full ${
              status === "connected"
                ? "bg-green-400 animate-pulse"
                : status === "error"
                  ? "bg-red-400"
                  : "bg-yellow-400 animate-pulse"
            }`}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Battery className="w-4 h-4" />
              <span>Battery</span>
            </div>
            <span className="font-mono text-sm">{battery !== null ? `${battery}%` : "—"}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Signal className="w-4 h-4" />
              <span>Signal</span>
            </div>
            <div className="flex gap-0.5 items-end">
              {[1, 2, 3, 4].map((bar) => (
                <div
                  key={bar}
                  className={`w-1.5 rounded-sm ${signal !== null && bar <= signal ? "bg-green-400" : "bg-gray-700"}`}
                  style={{ height: `${bar * 4 + 4}px` }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Wifi className="w-4 h-4" />
              <span>WebSocket</span>
            </div>
            <span
              className={`text-xs font-mono ${wsConnected ? "text-green-400" : "text-gray-500"}`}
            >
              {wsConnected ? "Live" : "Reconnecting…"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Last heartbeat</span>
            <span className="font-mono text-xs text-gray-300">
              {lastPing ? lastPing.toLocaleTimeString() : "—"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Total pings</span>
            <span className="font-mono text-sm text-blue-400">{pingCount}</span>
          </div>
        </div>
      </div>

      {/* SMS dispatch queue */}
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-sm">SMS Queue</span>
          </div>
          {smsQueue.length > 0 && (
            <span className="text-xs font-mono bg-blue-600 text-white px-2 py-0.5 rounded-full">
              {pendingCount} pending
            </span>
          )}
        </div>

        {smsQueue.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">
            No messages queued. Start a campaign to dispatch SMS through this device.
          </p>
        ) : (
          <div className="space-y-3">
            {smsQueue.map((msg) => {
              const isProcessing = msg.messageId === processingId;
              const isDone = msg.openedAt !== undefined && !isProcessing;
              return (
                <div
                  key={msg.messageId}
                  className={`rounded-lg p-3 border text-sm transition-colors ${
                    isProcessing
                      ? "border-blue-500/40 bg-blue-500/10"
                      : isDone
                        ? "border-green-500/30 bg-green-500/5 opacity-60"
                        : "border-gray-700 bg-gray-800"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-xs text-blue-300">{msg.phoneNumber}</span>
                    {isProcessing ? (
                      <span className="flex items-center gap-1 text-blue-400 text-xs">
                        <Loader2 className="w-3 h-3 animate-spin" /> Opening SMS…
                      </span>
                    ) : isDone ? (
                      <span className="flex items-center gap-1 text-green-400 text-xs">
                        <CheckCircle2 className="w-3 h-3" /> Sent
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-400 text-xs">
                        <Send className="w-3 h-3" /> Queued
                      </span>
                    )}
                  </div>
                  <p className="text-gray-300 text-xs line-clamp-2">{msg.messageText}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-5 text-sm text-gray-400">
        <p className="font-semibold text-gray-200 mb-2">Keep this page open</p>
        <p>
          When campaigns run, messages will appear above and your phone's SMS app will open
          automatically for each one. Tap <strong className="text-white">Send</strong> in the SMS
          app, then return here for the next message.
        </p>
        <div className="mt-3 text-xs text-gray-600">
          Heartbeat every {HEARTBEAT_INTERVAL_MS / 1000}s · Device ID #
          {infoRef.current?.deviceId ?? "—"}
        </div>
      </div>
    </div>
  );
}
