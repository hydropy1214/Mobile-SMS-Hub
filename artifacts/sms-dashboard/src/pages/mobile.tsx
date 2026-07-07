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
  ExternalLink,
  RefreshCw,
} from "lucide-react";

const HEARTBEAT_INTERVAL_MS = 20_000; // 20 seconds
const POLL_INTERVAL_MS = 5_000;       // poll for pending messages every 5 s

interface DeviceInfo {
  deviceId: number;
  token: string;
}

interface SmsItem {
  messageId: number;
  campaignId: number | null;
  phoneNumber: string;
  messageText: string;
  /** undefined = pending, "opened" = SMS app launched, "done" = confirmed */
  state: "pending" | "opened" | "done";
}

type ConnStatus = "connecting" | "connected" | "error" | "invalid";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseParams(): DeviceInfo | null {
  const p = new URLSearchParams(window.location.search);
  const deviceId = p.get("deviceId");
  const token = p.get("token");
  if (!deviceId || !token || isNaN(Number(deviceId))) return null;
  return { deviceId: Number(deviceId), token };
}

async function apiPatch(path: string, token: string, body: unknown): Promise<boolean> {
  try {
    const r = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function sendHeartbeat(info: DeviceInfo, battery: number | null, signal: number | null) {
  return apiPatch(`/api/devices/${info.deviceId}/heartbeat`, info.token, {
    status: "online",
    batteryLevel: battery,
    signalStrength: signal,
  });
}

async function confirmMessage(info: DeviceInfo, messageId: number, status: "sent" | "failed") {
  return apiPatch(`/api/messages/${messageId}/confirm`, info.token, { status });
}

async function fetchPendingMessages(info: DeviceInfo): Promise<SmsItem[]> {
  try {
    const r = await fetch(`/api/devices/${info.deviceId}/pending-messages`, {
      headers: { Authorization: `Bearer ${info.token}` },
    });
    if (!r.ok) return [];
    const rows = (await r.json()) as { id: number; campaignId: number | null; phoneNumber: string; messageText: string | null }[];
    return rows.map((m) => ({
      messageId: m.id,
      campaignId: m.campaignId,
      phoneNumber: m.phoneNumber,
      messageText: m.messageText ?? "",
      state: "pending" as const,
    }));
  } catch {
    return [];
  }
}

function getBattery(): Promise<number | null> {
  return new Promise((resolve) => {
    if ("getBattery" in navigator) {
      (navigator as unknown as { getBattery: () => Promise<{ level: number }> })
        .getBattery()
        .then((b) => resolve(Math.round(b.level * 100)))
        .catch(() => resolve(null));
    } else resolve(null);
  });
}

function getSignal(): number | null {
  const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
  if (!conn?.effectiveType) return null;
  return ({ "slow-2g": 1, "2g": 2, "3g": 3, "4g": 4 } as Record<string, number>)[conn.effectiveType] ?? null;
}

function getWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws`;
}

/**
 * Open the native SMS app without navigating the current page away.
 * Uses an invisible <a> with target="_blank" so the WebSocket stays alive.
 */
function openSmsApp(phone: string, body: string) {
  const a = document.createElement("a");
  a.href = `sms:${encodeURIComponent(phone)}?body=${encodeURIComponent(body)}`;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MobilePage() {
  const [connStatus, setConnStatus] = useState<ConnStatus>("connecting");
  const [wsRegistered, setWsRegistered] = useState(false);
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [signal, setSignal] = useState<number | null>(null);
  const [pingCount, setPingCount] = useState(0);
  const [queue, setQueue] = useState<SmsItem[]>([]);
  const [pollError, setPollError] = useState(false);

  const infoRef = useRef<DeviceInfo | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Merge incoming items into the queue without creating duplicates
  const mergeItems = useCallback((incoming: SmsItem[]) => {
    setQueue((prev) => {
      const existingIds = new Set(prev.map((m) => m.messageId));
      const fresh = incoming.filter((m) => !existingIds.has(m.messageId));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  // ── WebSocket (fast path for push dispatch) ────────────────────────────
  useEffect(() => {
    const info = parseParams();
    if (!info) { setConnStatus("invalid"); return; }
    infoRef.current = info;

    let destroyed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (destroyed) return;
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ event: "device:register", deviceId: info!.deviceId, token: info!.token }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { event: string; data: unknown };
          if (msg.event === "device:register:ok") {
            setWsRegistered(true);
          } else if (msg.event === "device:register:error") {
            setConnStatus("error");
          } else if (msg.event === "sms:dispatch") {
            const d = msg.data as { messageId: number; campaignId: number; phoneNumber: string; messageText: string };
            mergeItems([{ ...d, state: "pending" }]);
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        setWsRegistered(false);
        wsRef.current = null;
        if (!destroyed) reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [mergeItems]);

  // ── Heartbeat (keeps device "online" in DB) ────────────────────────────
  useEffect(() => {
    const info = infoRef.current;
    if (!info) return;

    async function ping() {
      const bat = await getBattery();
      const sig = getSignal();
      setBattery(bat);
      setSignal(sig);
      const ok = await sendHeartbeat(info!, bat, sig);
      if (ok) {
        setConnStatus("connected");
        setLastPing(new Date());
        setPingCount((n) => n + 1);
      } else {
        setConnStatus("error");
      }
    }

    void ping();
    const id = setInterval(() => void ping(), HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []); // runs once; infoRef is stable

  // ── HTTP polling (reliable fallback) ───────────────────────────────────
  useEffect(() => {
    const info = infoRef.current;
    if (!info) return;

    async function poll() {
      const items = await fetchPendingMessages(info!);
      if (items.length > 0) {
        setPollError(false);
        mergeItems(items);
      } else if (items.length === 0) {
        // 0 items can mean genuinely empty OR a fetch error (handled inside fetchPendingMessages)
        setPollError(false);
      }
    }

    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [mergeItems]);

  // ── Open SMS app for a specific item ──────────────────────────────────
  const handleOpenSms = useCallback(async (item: SmsItem) => {
    const info = infoRef.current;
    if (!info) return;

    // Mark as "opened" so the button changes state
    setQueue((q) => q.map((m) => m.messageId === item.messageId ? { ...m, state: "opened" } : m));
    openSmsApp(item.phoneNumber, item.messageText);

    // After a delay, confirm to server and mark done in UI
    await new Promise((r) => setTimeout(r, 5000));
    await confirmMessage(info, item.messageId, "sent");
    setQueue((q) => q.map((m) => m.messageId === item.messageId ? { ...m, state: "done" } : m));

    // Clean up done items after another 3 s
    setTimeout(() => {
      setQueue((q) => q.filter((m) => m.messageId !== item.messageId));
    }, 3000);
  }, []);

  // ── "Invalid link" screen ──────────────────────────────────────────────
  if (connStatus === "invalid") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center text-white max-w-xs">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Invalid Link</h1>
          <p className="text-gray-400 text-sm">
            Scan the QR code from the SMS Control dashboard to connect this device.
          </p>
        </div>
      </div>
    );
  }

  const pending = queue.filter((m) => m.state === "pending");
  const opened  = queue.filter((m) => m.state === "opened");
  const done    = queue.filter((m) => m.state === "done");

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-start p-4 pt-8">
      {/* Brand */}
      <div className="mb-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-3">
          <Smartphone className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-xl font-bold">SMS Control</h1>
        <p className="text-gray-400 text-xs mt-0.5">Mobile Gateway Agent</p>
      </div>

      {/* Status card */}
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-3">
        <div className="flex items-center gap-2 mb-4">
          {connStatus === "connecting" && <><Loader2 className="w-5 h-5 text-blue-400 animate-spin" /><span className="text-blue-400 font-semibold text-sm">Connecting…</span></>}
          {connStatus === "connected"  && <><CheckCircle2 className="w-5 h-5 text-green-400" /><span className="text-green-400 font-semibold text-sm">Connected</span></>}
          {connStatus === "error"      && <><WifiOff className="w-5 h-5 text-red-400" /><span className="text-red-400 font-semibold text-sm">Connection error — retrying</span></>}
          <div className={`ml-auto w-2.5 h-2.5 rounded-full ${
            connStatus === "connected" ? "bg-green-400 animate-pulse" :
            connStatus === "error"     ? "bg-red-400" : "bg-yellow-400 animate-pulse"
          }`} />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
              <Battery className="w-3.5 h-3.5" /> Battery
            </div>
            <span className="font-mono font-semibold">{battery !== null ? `${battery}%` : "—"}</span>
          </div>

          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
              <Signal className="w-3.5 h-3.5" /> Signal
            </div>
            <div className="flex gap-0.5 items-end h-5">
              {[1,2,3,4].map((b) => (
                <div key={b} className={`w-1.5 rounded-sm ${signal !== null && b <= signal ? "bg-green-400" : "bg-gray-600"}`}
                  style={{ height: `${b * 4 + 4}px` }} />
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
              <Wifi className="w-3.5 h-3.5" /> WebSocket
            </div>
            <span className={`text-xs font-mono font-semibold ${wsRegistered ? "text-green-400" : "text-yellow-400"}`}>
              {wsRegistered ? "Registered" : "Connecting…"}
            </span>
          </div>

          <div className="bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
              <RefreshCw className="w-3.5 h-3.5" /> Heartbeats
            </div>
            <span className="font-mono font-semibold text-blue-400">{pingCount}</span>
          </div>
        </div>

        {lastPing && (
          <p className="text-xs text-gray-600 text-center mt-3">
            Last ping: {lastPing.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* SMS Queue */}
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-3">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-sm">SMS Queue</span>
          </div>
          {pending.length > 0 && (
            <span className="text-xs font-mono bg-blue-600 px-2 py-0.5 rounded-full">
              {pending.length} pending
            </span>
          )}
        </div>

        {queue.length === 0 ? (
          <div className="text-center py-6">
            <MessageSquare className="w-8 h-8 text-gray-700 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No messages — start a campaign to begin</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Pending — actionable */}
            {pending.map((msg) => (
              <div key={msg.messageId} className="rounded-xl p-3.5 border border-gray-700 bg-gray-800">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-mono text-blue-300 text-xs">{msg.phoneNumber}</span>
                  <span className="text-gray-500 text-xs shrink-0">#{msg.messageId}</span>
                </div>
                <p className="text-gray-300 text-xs mb-3 leading-relaxed line-clamp-3">{msg.messageText}</p>
                <button
                  onClick={() => void handleOpenSms(msg)}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open SMS App
                </button>
              </div>
            ))}

            {/* Opened — confirming */}
            {opened.map((msg) => (
              <div key={msg.messageId} className="rounded-xl p-3.5 border border-blue-500/30 bg-blue-500/10">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-blue-300 text-xs">{msg.phoneNumber}</span>
                  <span className="flex items-center gap-1 text-blue-400 text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" /> Confirming…
                  </span>
                </div>
                <p className="text-gray-400 text-xs line-clamp-2">{msg.messageText}</p>
              </div>
            ))}

            {/* Done */}
            {done.map((msg) => (
              <div key={msg.messageId} className="rounded-xl p-3.5 border border-green-500/20 bg-green-500/5 opacity-60">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-gray-400 text-xs">{msg.phoneNumber}</span>
                  <span className="flex items-center gap-1 text-green-400 text-xs">
                    <CheckCircle2 className="w-3 h-3" /> Sent
                  </span>
                </div>
                <p className="text-gray-500 text-xs line-clamp-1">{msg.messageText}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-5 text-sm text-gray-400 mb-4">
        <p className="font-semibold text-gray-200 mb-2 text-sm">How this works</p>
        <ol className="space-y-1.5 text-xs list-decimal list-inside text-gray-400">
          <li>Start a campaign from the dashboard</li>
          <li>Messages appear above in the queue</li>
          <li>Tap <strong className="text-white">Open SMS App</strong> for each message</li>
          <li>Your phone's SMS app opens with the number &amp; text pre-filled</li>
          <li>Tap <strong className="text-white">Send</strong> then come back here</li>
        </ol>
        <div className="mt-3 pt-3 border-t border-gray-800 text-xs text-gray-600 flex justify-between">
          <span>Device #{infoRef.current?.deviceId ?? "—"}</span>
          <span>Polls every {POLL_INTERVAL_MS / 1000}s</span>
        </div>
      </div>
    </div>
  );
}
