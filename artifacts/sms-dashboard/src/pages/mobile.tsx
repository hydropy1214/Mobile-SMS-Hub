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
  RefreshCw,
  Zap,
  Clock,
  XCircle,
} from "lucide-react";

const HEARTBEAT_INTERVAL_MS = 20_000; // 20 seconds
const POLL_INTERVAL_MS = 4_000;       // poll for pending messages every 4 s
const SMS_APP_OPEN_DELAY_MS = 200;    // brief pause before launching SMS app
/** Wait this long for user to tap Send in the SMS app, then auto-confirm. */
const SMS_CONFIRM_DELAY_MS = 10_000;

interface DeviceInfo {
  deviceId: number;
  token: string;
}

interface SmsItem {
  messageId: number;
  campaignId: number | null;
  phoneNumber: string;
  messageText: string;
  state: "queued" | "sending" | "confirmed" | "failed";
}

interface LogEntry {
  id: number;
  ts: Date;
  text: string;
  type: "info" | "success" | "error";
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
    const rows = (await r.json()) as {
      id: number;
      campaignId: number | null;
      phoneNumber: string;
      messageText: string | null;
    }[];
    return rows.map((m) => ({
      messageId: m.id,
      campaignId: m.campaignId,
      phoneNumber: m.phoneNumber,
      messageText: m.messageText ?? "",
      state: "queued" as const,
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
 * Open the native SMS app with number + body pre-filled via the sms: URI scheme.
 * On Android, this deep-links into the default messaging app without navigating
 * the page away (invisible anchor trick keeps the WebSocket alive).
 */
function openSmsApp(phone: string, body: string): boolean {
  try {
    const a = document.createElement("a");
    a.href = `sms:${encodeURIComponent(phone)}?body=${encodeURIComponent(body)}`;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch {
    return false;
  }
}

/** Request Wake Lock — keeps screen on while the gateway page is active. */
type WakeLockSentinelLike = { released: boolean; release: () => Promise<void>; addEventListener: (e: string, cb: () => void) => void };
type NavWithWakeLock = { wakeLock?: { request: (t: string) => Promise<WakeLockSentinelLike> } };

async function requestWakeLock(): Promise<WakeLockSentinelLike | null> {
  try {
    const nav = navigator as unknown as NavWithWakeLock;
    if (nav.wakeLock) return await nav.wakeLock.request("screen");
  } catch { /* not supported / denied */ }
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

let logIdCounter = 0;

export default function MobilePage() {
  const [connStatus, setConnStatus] = useState<ConnStatus>("connecting");
  const [wsRegistered, setWsRegistered] = useState(false);
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [signal, setSignal] = useState<number | null>(null);
  const [pingCount, setPingCount] = useState(0);
  const [queue, setQueue] = useState<SmsItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalSent, setTotalSent] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const infoRef        = useRef<DeviceInfo | null>(null);
  const wsRef          = useRef<WebSocket | null>(null);
  const processingRef  = useRef(false);
  const queueRef       = useRef<SmsItem[]>([]);
  const wakeLockRef    = useRef<WakeLockSentinelLike | null>(null);
  const mountedRef     = useRef(true);  // tracks whether component is still mounted

  // Keep queueRef in sync with queue state
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // Mark unmounted on teardown
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const addLog = useCallback((text: string, type: LogEntry["type"] = "info") => {
    if (!mountedRef.current) return;
    setLogs((prev) => {
      const entry: LogEntry = { id: logIdCounter++, ts: new Date(), text, type };
      return [entry, ...prev].slice(0, 50);
    });
  }, []);

  // ── Wake Lock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let sentinel: WakeLockSentinelLike | null = null;

    async function acquire() {
      sentinel = await requestWakeLock();
      if (sentinel && mountedRef.current) {
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener("release", () => {
          if (mountedRef.current) setWakeLockActive(false);
        });
      }
    }

    void acquire();

    // Re-acquire when page becomes visible again (browser auto-releases on hide)
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        const current = wakeLockRef.current;
        // Re-acquire if there's no sentinel or the existing one was released
        if (!current || current.released) {
          void acquire();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      // Release wake lock on unmount
      if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => { /* ignore */ });
      }
      wakeLockRef.current = null;
    };
  }, []);

  // ── Auto-processor: drain queue one message at a time ────────────────────
  const processNext = useCallback(async () => {
    if (processingRef.current || !mountedRef.current) return;
    const info = infoRef.current;
    if (!info) return;

    const next = queueRef.current.find((m) => m.state === "queued");
    if (!next) return;

    processingRef.current = true;
    if (mountedRef.current) setIsProcessing(true);

    // Mark as "sending" in UI
    if (mountedRef.current) {
      setQueue((q) => q.map((m) => m.messageId === next.messageId ? { ...m, state: "sending" } : m));
    }
    addLog(`Dispatching SMS to ${next.phoneNumber}…`, "info");

    // Brief pause then launch the SMS app
    await new Promise((r) => setTimeout(r, SMS_APP_OPEN_DELAY_MS));
    if (!mountedRef.current) { processingRef.current = false; return; }

    openSmsApp(next.phoneNumber, next.messageText);

    // Wait for user to tap Send in SMS app, then confirm
    await new Promise((r) => setTimeout(r, SMS_CONFIRM_DELAY_MS));
    if (!mountedRef.current) { processingRef.current = false; return; }

    const ok = await confirmMessage(info, next.messageId, "sent");
    if (!mountedRef.current) { processingRef.current = false; return; }

    if (ok) {
      setQueue((q) => q.map((m) => m.messageId === next.messageId ? { ...m, state: "confirmed" } : m));
      setTotalSent((n) => n + 1);
      addLog(`✓ Confirmed sent to ${next.phoneNumber}`, "success");
    } else {
      setQueue((q) => q.map((m) => m.messageId === next.messageId ? { ...m, state: "failed" } : m));
      setTotalFailed((n) => n + 1);
      addLog(`✗ Confirm failed for ${next.phoneNumber}`, "error");
    }

    // Remove resolved item from queue after a short display period
    setTimeout(() => {
      if (mountedRef.current) {
        setQueue((q) => q.filter((m) => m.messageId !== next.messageId));
      }
    }, 3000);

    processingRef.current = false;
    if (mountedRef.current) setIsProcessing(false);

    // Immediately check for more queued items
    setTimeout(() => { void processNext(); }, 200);
  }, [addLog]);

  // Kick the processor whenever something new is queued
  useEffect(() => {
    const hasQueued = queue.some((m) => m.state === "queued");
    if (hasQueued && !processingRef.current) {
      void processNext();
    }
  }, [queue, processNext]);

  // Merge incoming items without creating duplicates
  const mergeItems = useCallback((incoming: SmsItem[]) => {
    setQueue((prev) => {
      const existingIds = new Set(prev.map((m) => m.messageId));
      const fresh = incoming.filter((m) => !existingIds.has(m.messageId));
      if (fresh.length && mountedRef.current) {
        addLog(`${fresh.length} new message(s) received`, "info");
      }
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, [addLog]);

  // ── WebSocket (fast-path push dispatch) ───────────────────────────────────
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
            addLog("WebSocket registered — push dispatch active", "success");
          } else if (msg.event === "device:register:error") {
            setConnStatus("error");
            addLog("WebSocket registration failed", "error");
          } else if (msg.event === "sms:dispatch") {
            const d = msg.data as { messageId: number; campaignId: number; phoneNumber: string; messageText: string };
            mergeItems([{ ...d, state: "queued" }]);
          }
        } catch { /* ignore parse errors */ }
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
  }, [mergeItems, addLog]);

  // ── Heartbeat (keeps device "online" in DB) ───────────────────────────────
  useEffect(() => {
    const info = infoRef.current;
    if (!info) return;

    async function ping() {
      const bat = await getBattery();
      const sig = getSignal();
      if (!mountedRef.current) return;
      setBattery(bat);
      setSignal(sig);
      const ok = await sendHeartbeat(info!, bat, sig);
      if (!mountedRef.current) return;
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
  }, []); // runs once — infoRef is stable

  // ── HTTP polling (reliable fallback) ──────────────────────────────────────
  useEffect(() => {
    const info = infoRef.current;
    if (!info) return;

    async function poll() {
      const items = await fetchPendingMessages(info!);
      if (items.length > 0 && mountedRef.current) mergeItems(items);
    }

    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [mergeItems]);

  // ── Invalid link screen ───────────────────────────────────────────────────
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

  const queued    = queue.filter((m) => m.state === "queued");
  const sending   = queue.filter((m) => m.state === "sending");
  const confirmed = queue.filter((m) => m.state === "confirmed");

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-start p-4 pt-6">
      {/* Brand */}
      <div className="mb-5 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-3">
          <Smartphone className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-xl font-bold">SMS Control</h1>
        <p className="text-gray-400 text-xs mt-0.5">Auto-Send Gateway</p>
      </div>

      {/* Status card */}
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-3">
        <div className="flex items-center gap-2 mb-4">
          {connStatus === "connecting" && <><Loader2 className="w-5 h-5 text-blue-400 animate-spin" /><span className="text-blue-400 font-semibold text-sm">Connecting…</span></>}
          {connStatus === "connected"  && <><CheckCircle2 className="w-5 h-5 text-green-400" /><span className="text-green-400 font-semibold text-sm">Connected — Auto-Send Active</span></>}
          {connStatus === "error"      && <><WifiOff className="w-5 h-5 text-red-400" /><span className="text-red-400 font-semibold text-sm">Reconnecting…</span></>}
          <div className={`ml-auto w-2.5 h-2.5 rounded-full ${
            connStatus === "connected" ? "bg-green-400 animate-pulse" :
            connStatus === "error"     ? "bg-red-400" : "bg-yellow-400 animate-pulse"
          }`} />
        </div>

        <div className="grid grid-cols-4 gap-2 text-xs mb-3">
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <Battery className="w-3.5 h-3.5 text-gray-400 mx-auto mb-0.5" />
            <span className="font-mono font-semibold block">{battery !== null ? `${battery}%` : "—"}</span>
          </div>
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <Signal className="w-3.5 h-3.5 text-gray-400 mx-auto mb-0.5" />
            <div className="flex gap-0.5 items-end h-3.5 justify-center">
              {[1,2,3,4].map((b) => (
                <div key={b}
                  className={`w-1 rounded-sm ${signal !== null && b <= signal ? "bg-green-400" : "bg-gray-600"}`}
                  style={{ height: `${b * 3 + 2}px` }}
                />
              ))}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <Wifi className="w-3.5 h-3.5 mx-auto mb-0.5" style={{ color: wsRegistered ? "#4ade80" : "#facc15" }} />
            <span className={`font-mono font-semibold block text-xs ${wsRegistered ? "text-green-400" : "text-yellow-400"}`}>
              {wsRegistered ? "WS✓" : "WS…"}
            </span>
          </div>
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <RefreshCw className="w-3.5 h-3.5 text-blue-400 mx-auto mb-0.5" />
            <span className="font-mono font-semibold block text-blue-400">{pingCount}</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-800/60 rounded-lg p-2 text-center border border-blue-500/20">
            <span className="text-xl font-bold text-blue-400">{queued.length + sending.length}</span>
            <p className="text-gray-500 text-xs mt-0.5">Queued</p>
          </div>
          <div className="bg-gray-800/60 rounded-lg p-2 text-center border border-green-500/20">
            <span className="text-xl font-bold text-green-400">{totalSent}</span>
            <p className="text-gray-500 text-xs mt-0.5">Sent</p>
          </div>
          <div className="bg-gray-800/60 rounded-lg p-2 text-center border border-red-500/20">
            <span className="text-xl font-bold text-red-400">{totalFailed}</span>
            <p className="text-gray-500 text-xs mt-0.5">Failed</p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 text-xs">
          {wakeLockActive ? (
            <span className="text-green-600">🔒 Screen wake lock active</span>
          ) : (
            <span className="text-gray-700">Wake lock unavailable</span>
          )}
          {lastPing && (
            <span className="text-gray-700">Ping {lastPing.toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {/* Currently sending */}
      {sending.length > 0 && (
        <div className="w-full max-w-sm bg-blue-950/60 rounded-2xl border border-blue-500/30 p-4 mb-3">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-blue-400 animate-pulse" />
            <span className="font-semibold text-sm text-blue-300">Sending Now</span>
          </div>
          {sending.map((msg) => (
            <div key={msg.messageId} className="flex items-start gap-3">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin mt-0.5 shrink-0" />
              <div>
                <p className="font-mono text-blue-300 text-sm font-semibold">{msg.phoneNumber}</p>
                <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{msg.messageText}</p>
                <p className="text-blue-500 text-xs mt-1">
                  SMS app opening — tap <strong className="text-blue-300">Send</strong>, returns in {SMS_CONFIRM_DELAY_MS / 1000}s
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Queue / confirmed items */}
      {(queued.length > 0 || confirmed.length > 0) && (
        <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-3">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-gray-400" />
            <span className="font-semibold text-sm">Queue</span>
            {queued.length > 0 && (
              <span className="ml-auto text-xs font-mono bg-blue-600/80 px-2 py-0.5 rounded-full">
                {queued.length} waiting
              </span>
            )}
          </div>
          <div className="space-y-2">
            {queued.slice(0, 5).map((msg, i) => (
              <div key={msg.messageId} className="flex items-center gap-2 text-xs bg-gray-800/50 rounded-lg px-3 py-2">
                <Clock className="w-3 h-3 shrink-0 text-gray-600" />
                <span className="font-mono text-gray-300">{msg.phoneNumber}</span>
                <span className="text-gray-600 ml-auto">#{i + 1}</span>
              </div>
            ))}
            {queued.length > 5 && (
              <p className="text-xs text-gray-600 text-center py-1">+{queued.length - 5} more…</p>
            )}
            {confirmed.map((msg) => (
              <div key={msg.messageId} className="flex items-center gap-2 text-xs bg-green-500/5 rounded-lg px-3 py-2 border border-green-500/10 opacity-70">
                <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                <span className="font-mono text-gray-400">{msg.phoneNumber}</span>
                <span className="text-green-400 ml-auto">Sent</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Idle state */}
      {queue.length === 0 && !isProcessing && connStatus === "connected" && (
        <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-3 text-center">
          <CheckCircle2 className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 text-sm font-medium">Gateway ready</p>
          <p className="text-gray-600 text-xs mt-1">Waiting for campaigns from dashboard…</p>
        </div>
      )}

      {/* Activity log */}
      {logs.length > 0 && (
        <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-3">
          <p className="font-semibold text-sm mb-3 text-gray-300">Activity Log</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 text-xs">
                {log.type === "success" && <CheckCircle2 className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />}
                {log.type === "error"   && <XCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />}
                {log.type === "info"    && <div className="w-3 h-3 mt-0.5 shrink-0 rounded-full border border-gray-600" />}
                <span className={`flex-1 ${
                  log.type === "success" ? "text-green-300" :
                  log.type === "error"   ? "text-red-300" : "text-gray-400"
                }`}>
                  {log.text}
                </span>
                <span className="text-gray-700 shrink-0">{log.ts.toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How this works */}
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-4 text-sm text-gray-400 mb-8">
        <p className="font-semibold text-gray-200 mb-2 text-sm">How auto-send works</p>
        <ol className="space-y-1.5 text-xs list-decimal list-inside text-gray-400">
          <li>Open this page once by scanning the QR code</li>
          <li>Keep the screen on — screen lock is requested automatically</li>
          <li>Start a campaign from the dashboard</li>
          <li>Each SMS triggers automatically — your SMS app opens pre-filled</li>
          <li>Tap <strong className="text-white">Send</strong> in the SMS app, then return here</li>
          <li>Next message fires automatically after {SMS_CONFIRM_DELAY_MS / 1000}s</li>
        </ol>
        <div className="mt-3 pt-3 border-t border-gray-800 text-xs text-gray-600 flex justify-between">
          <span>Device #{infoRef.current?.deviceId ?? "—"}</span>
          <span>Polls every {POLL_INTERVAL_MS / 1000}s</span>
        </div>
      </div>
    </div>
  );
}
