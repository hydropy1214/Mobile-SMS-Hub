import { useEffect, useState, useRef } from "react";
import { Smartphone, Wifi, WifiOff, Battery, Signal, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

const HEARTBEAT_INTERVAL_MS = 25_000; // 25 seconds

interface DeviceInfo {
  deviceId: number;
  token: string;
}

type ConnectionStatus = "connecting" | "connected" | "error" | "invalid";

function parseParams(): DeviceInfo | null {
  const params = new URLSearchParams(window.location.search);
  const deviceId = params.get("deviceId");
  const token = params.get("token");
  if (!deviceId || !token || isNaN(Number(deviceId))) return null;
  return { deviceId: Number(deviceId), token };
}

async function sendHeartbeat(info: DeviceInfo, battery: number | null, signal: number | null): Promise<boolean> {
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

function getBatteryLevel(): Promise<number | null> {
  return new Promise((resolve) => {
    if ("getBattery" in navigator) {
      (navigator as any).getBattery().then((bat: any) => {
        resolve(Math.round(bat.level * 100));
      }).catch(() => resolve(null));
    } else {
      resolve(null);
    }
  });
}

function getSignalStrength(): number | null {
  const conn = (navigator as any).connection;
  if (!conn) return null;
  const map: Record<string, number> = { "slow-2g": 1, "2g": 2, "3g": 3, "4g": 4 };
  return map[conn.effectiveType] ?? null;
}

export default function MobilePage() {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [signal, setSignal] = useState<number | null>(null);
  const [pingCount, setPingCount] = useState(0);
  const infoRef = useRef<DeviceInfo | null>(null);

  useEffect(() => {
    const info = parseParams();
    if (!info) {
      setStatus("invalid");
      return;
    }
    infoRef.current = info;

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
    const interval = setInterval(() => { void ping(); }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  if (status === "invalid") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center text-white max-w-xs">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Invalid Link</h1>
          <p className="text-gray-400 text-sm">This connection link is missing required parameters. Please scan the QR code again from the SMS Control dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      {/* Logo / Brand */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
          <Smartphone className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">SMS Control</h1>
        <p className="text-gray-400 text-sm mt-1">Mobile Gateway Agent</p>
      </div>

      {/* Status card */}
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          {status === "connecting" && (
            <><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /><span className="text-blue-400 font-semibold">Connecting…</span></>
          )}
          {status === "connected" && (
            <><CheckCircle2 className="w-6 h-6 text-green-400" /><span className="text-green-400 font-semibold">Connected & Active</span></>
          )}
          {status === "error" && (
            <><WifiOff className="w-6 h-6 text-red-400" /><span className="text-red-400 font-semibold">Connection Failed</span></>
          )}
          <div className={`ml-auto w-3 h-3 rounded-full ${status === "connected" ? "bg-green-400 animate-pulse" : status === "error" ? "bg-red-400" : "bg-yellow-400 animate-pulse"}`} />
        </div>

        <div className="space-y-4">
          {/* Battery */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Battery className="w-4 h-4" />
              <span>Battery</span>
            </div>
            <span className="font-mono text-sm">
              {battery !== null ? `${battery}%` : "—"}
            </span>
          </div>

          {/* Signal */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Signal className="w-4 h-4" />
              <span>Signal</span>
            </div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4].map((bar) => (
                <div
                  key={bar}
                  className={`w-1.5 rounded-sm ${signal !== null && bar <= signal ? "bg-green-400" : "bg-gray-700"}`}
                  style={{ height: `${bar * 4 + 4}px` }}
                />
              ))}
            </div>
          </div>

          {/* Last heartbeat */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Wifi className="w-4 h-4" />
              <span>Last heartbeat</span>
            </div>
            <span className="font-mono text-xs text-gray-300">
              {lastPing ? lastPing.toLocaleTimeString() : "—"}
            </span>
          </div>

          {/* Ping count */}
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Total pings</span>
            <span className="font-mono text-sm text-blue-400">{pingCount}</span>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-5 text-sm text-gray-400">
        <p className="font-semibold text-gray-200 mb-2">Keep this page open</p>
        <p>This device is now registered as an SMS gateway. The dashboard will route outbound SMS campaigns through this phone. Do not close this tab.</p>
        <div className="mt-3 text-xs text-gray-600">
          Heartbeat every {HEARTBEAT_INTERVAL_MS / 1000}s &nbsp;·&nbsp; Device ID #{infoRef.current?.deviceId ?? "—"}
        </div>
      </div>
    </div>
  );
}
