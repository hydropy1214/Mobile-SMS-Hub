import { useEffect, useState, useRef, useCallback } from "react";
import {
  CheckCircle2,
  Smartphone,
  Terminal,
  Download,
  Copy,
  Check,
  Loader2,
  WifiOff,
  Zap,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface DeviceInfo {
  id: number;
  name: string;
  phoneNumber: string;
  status: string;
  batteryLevel: number | null;
  signalStrength: number | null;
  simSlot: number | null;
}

function parseParams(): { deviceId: number; token: string } | null {
  const p = new URLSearchParams(window.location.search);
  const deviceId = p.get("deviceId");
  const token = p.get("token");
  if (!deviceId || !token || isNaN(Number(deviceId))) return null;
  return { deviceId: Number(deviceId), token };
}

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(text).catch(() => {
      // fallback for older Android browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors shrink-0"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-center gap-2 bg-black/40 rounded-xl border border-white/10 p-3">
      <code className="flex-1 font-mono text-xs text-green-300 break-all leading-relaxed">{code}</code>
      <CopyBtn text={code} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SetupPage() {
  const params = parseParams();
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [checking, setChecking] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchDevice = useCallback(async () => {
    if (!params) return;
    try {
      const r = await fetch(`/api/devices/${params.deviceId}`, {
        headers: { Authorization: `Bearer ${params.token}` },
      });
      if (!r.ok) throw new Error("not found");
      const d = (await r.json()) as DeviceInfo;
      if (mountedRef.current) {
        setDevice(d);
        setLoadError(false);
        setChecking(false);
      }
    } catch {
      if (mountedRef.current) {
        setLoadError(true);
        setChecking(false);
      }
    }
  }, [params?.deviceId, params?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load + poll every 5 s to detect when daemon comes online
  useEffect(() => {
    void fetchDevice();
    const id = setInterval(() => void fetchDevice(), 5000);
    return () => clearInterval(id);
  }, [fetchDevice]);

  // ── Invalid link ──────────────────────────────────────────────────────────
  if (!params) {
    return (
      <Screen>
        <AlertTriangle className="w-14 h-14 text-red-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Invalid Link</h1>
        <p className="text-gray-400 text-sm text-center">
          Scan the QR code from the SMS Control dashboard to set up this device.
        </p>
      </Screen>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const daemonCmd = `curl -o ~/sms-daemon.sh '${origin}/api/native/v1/daemon/${params.token}' && bash ~/sms-daemon.sh`;
  const depsCmd = "pkg install termux-api jq curl -y";
  const isOnline = device?.status === "online";

  // ── Loading ───────────────────────────────────────────────────────────────
  if (checking) {
    return (
      <Screen>
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm">Loading device info…</p>
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <WifiOff className="w-14 h-14 text-red-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Device not found</h1>
        <p className="text-gray-400 text-sm text-center mb-4">
          This QR code may be expired. Re-register the device from the dashboard.
        </p>
        <button onClick={() => { setChecking(true); void fetchDevice(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </Screen>
    );
  }

  // ── Connected & online ────────────────────────────────────────────────────
  if (isOnline) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-5">
        <div className="w-full max-w-sm space-y-5">
          {/* Success hero */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500/40 mb-4">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Auto-Sending Active</h1>
            <p className="text-green-400 text-sm mt-1 font-medium">No interaction needed — fully automatic</p>
          </div>

          {/* Device card */}
          <div className="bg-gray-900 rounded-2xl border border-green-500/20 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{device?.name}</p>
                <p className="text-gray-400 text-xs font-mono">{device?.phoneNumber}
                  {device?.simSlot != null ? ` · SIM ${device.simSlot + 1}` : ""}
                </p>
              </div>
              <span className="ml-auto flex items-center gap-1.5 text-xs text-green-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Online
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-800 rounded-lg p-2.5 text-center">
                <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">Battery</p>
                <p className="text-white font-mono font-semibold">
                  {device?.batteryLevel != null ? `${device.batteryLevel}%` : "—"}
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-2.5 text-center">
                <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">Signal</p>
                <p className="text-white font-mono font-semibold">
                  {device?.signalStrength != null ? `${device.signalStrength}/4` : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* What happens now */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
            <p className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" /> What happens now
            </p>
            <ol className="space-y-2 text-xs text-gray-400 list-none">
              {[
                "Dashboard operator starts a campaign",
                "Messages are assigned to this phone automatically",
                "Termux daemon picks them up every 4 seconds",
                "SMS is sent via your SIM — no taps, no prompts",
                "Status updates back to the dashboard in real time",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="w-4 h-4 rounded-full bg-green-500/20 text-green-400 text-[10px] font-bold flex items-center justify-center mt-0.5 shrink-0">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <p className="text-center text-xs text-gray-600">
            Keep Termux running in the background. Screen can be off — daemon runs headlessly.
          </p>
        </div>
      </div>
    );
  }

  // ── Setup wizard (device offline) ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start p-5 pt-8 pb-12">
      <div className="w-full max-w-sm space-y-5">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-3">
            <Terminal className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Set Up Auto-SMS</h1>
          <p className="text-gray-400 text-sm mt-1">
            Follow 3 steps to make <span className="text-white font-medium">{device?.name}</span> send messages automatically — no tapping ever.
          </p>
        </div>

        {/* Waiting indicator */}
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
          <Loader2 className="w-4 h-4 text-yellow-400 animate-spin shrink-0" />
          <p className="text-yellow-400 text-xs">Waiting for daemon to connect… This page updates automatically.</p>
        </div>

        {/* Device info */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{device?.name}</p>
            <p className="text-gray-500 text-xs font-mono">{device?.phoneNumber}
              {device?.simSlot != null ? ` · SIM ${device.simSlot + 1}` : ""}
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-gray-600" />
            Offline
          </span>
        </div>

        {/* Step 1 */}
        <StepCard step={1} color="blue" title="Install Termux + Termux:API">
          <p className="text-gray-400 text-xs mb-3">
            Both apps are free. Download from F-Droid (recommended) or Google Play.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <a
              href="https://f-droid.org/packages/com.termux/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              Termux
            </a>
            <a
              href="https://f-droid.org/packages/com.termux.api/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-600/70 text-white text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              Termux:API
            </a>
          </div>
          <p className="text-gray-600 text-[10px] mt-2 text-center">
            Grant SMS permission to Termux:API when prompted
          </p>
        </StepCard>

        {/* Step 2 */}
        <StepCard step={2} color="purple" title="Install dependencies in Termux">
          <p className="text-gray-400 text-xs mb-3">
            Open Termux and run this command once:
          </p>
          <CodeBlock code={depsCmd} />
          <p className="text-gray-600 text-[10px] mt-2">
            This installs the SMS tools, JSON parser, and HTTP client.
          </p>
        </StepCard>

        {/* Step 3 */}
        <StepCard step={3} color="green" title="Start the auto-send daemon">
          <p className="text-gray-400 text-xs mb-3">
            Run this command in Termux — it downloads and starts the daemon:
          </p>
          <CodeBlock code={daemonCmd} />
          <div className="mt-3 bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-xs text-green-400">
            <p className="font-semibold mb-1">✓ Once running:</p>
            <ul className="space-y-1 text-green-400/80 list-none">
              <li>• Messages sent automatically via your SIM</li>
              <li>• No tapping required — ever</li>
              <li>• This page shows "Auto-Sending Active" when ready</li>
            </ul>
          </div>
        </StepCard>

        {/* Keep alive tip */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 text-xs text-gray-400 space-y-2">
          <p className="text-white font-semibold text-sm">Keep the daemon running</p>
          <p>Run inside <code className="bg-gray-800 px-1 rounded font-mono">tmux</code> so it survives closing Termux:</p>
          <CodeBlock code="pkg install tmux -y && tmux new -s sms" />
          <p className="text-gray-600 text-[10px]">
            Then paste the Step 3 command. Detach with <code className="bg-gray-800 px-1 rounded font-mono">Ctrl+B D</code>.
          </p>
        </div>

        {/* Advanced: Play Store fallback */}
        <div className="text-center">
          <p className="text-gray-600 text-xs mb-2">Can't use F-Droid?</p>
          <div className="flex justify-center gap-3">
            <a href="https://play.google.com/store/apps/details?id=com.termux"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <ExternalLink className="w-3 h-3" /> Termux on Play Store
            </a>
            <a href="https://play.google.com/store/apps/details?id=com.termux.api"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <ExternalLink className="w-3 h-3" /> Termux:API on Play Store
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
      {children}
    </div>
  );
}

const stepColors = {
  blue:   { bg: "bg-blue-600/20",   border: "border-blue-500/30",   num: "bg-blue-600",   text: "text-blue-400"   },
  purple: { bg: "bg-purple-600/20", border: "border-purple-500/30", num: "bg-purple-600", text: "text-purple-400" },
  green:  { bg: "bg-green-600/20",  border: "border-green-500/30",  num: "bg-green-600",  text: "text-green-400"  },
} as const;

function StepCard({
  step, color, title, children,
}: {
  step: number;
  color: keyof typeof stepColors;
  title: string;
  children: React.ReactNode;
}) {
  const c = stepColors[color];
  return (
    <div className={`bg-gray-900 rounded-2xl border ${c.border} p-4`}>
      <div className="flex items-center gap-3 mb-3">
        <span className={`w-7 h-7 rounded-full ${c.num} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
          {step}
        </span>
        <p className={`font-semibold text-sm ${c.text}`}>{title}</p>
      </div>
      {children}
    </div>
  );
}
