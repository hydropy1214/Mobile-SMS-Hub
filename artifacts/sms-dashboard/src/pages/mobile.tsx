/**
 * /mobile — landing page reached when the connect QR code is scanned
 * with the phone's default camera app.
 *
 * This page does NOT run the gateway itself. The gateway runs inside the
 * SMS Gateway app (Expo). This page simply shows the user how to open
 * the connect URL in the app.
 */

import { useState } from "react";
import { Check, Copy, Smartphone, Download, ExternalLink, Radio } from "lucide-react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
        copied
          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
          : "bg-white/10 text-white border border-white/20 hover:bg-white/15 active:scale-95"
      }`}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

export default function MobilePage() {
  const connectUrl = window.location.href;
  const isValid =
    new URLSearchParams(window.location.search).has("token") &&
    new URLSearchParams(window.location.search).has("deviceId");

  const steps = [
    {
      n: "1",
      title: "Install Expo Go",
      body: (
        <a
          href="https://play.google.com/store/apps/details?id=host.exp.exponent"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-emerald-400 text-xs mt-1 hover:underline"
        >
          <Download className="w-3 h-3" />
          Google Play — Expo Go
          <ExternalLink className="w-3 h-3" />
        </a>
      ),
    },
    {
      n: "2",
      title: "Open the SMS Gateway app",
      body: (
        <p className="text-white/50 text-xs mt-1 leading-relaxed">
          On your dashboard, click the preview dropdown{" "}
          <span className="font-mono bg-white/10 px-1 rounded text-white/70">⊙</span> and
          select <strong className="text-white/70">SMS Gateway App</strong>. Scan the Expo
          QR code shown there with Expo Go.
        </p>
      ),
    },
    {
      n: "3",
      title: "Paste this link inside the app",
      body: (
        <p className="text-white/50 text-xs mt-1 leading-relaxed">
          Tap <strong className="text-white/70">Paste URL instead</strong> at the bottom of
          the scanner screen, paste the link, then tap{" "}
          <strong className="text-white/70">Connect</strong>.
        </p>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center px-5 py-12">
      {/* Icon + heading */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-5">
          <Radio className="w-8 h-8 text-emerald-400" />
        </div>
        <h1 className="text-white text-2xl font-bold text-center">SMS Gateway</h1>
        <p className="text-white/50 text-sm text-center mt-2 max-w-xs leading-relaxed">
          {isValid
            ? "Open this link in the SMS Gateway app to connect this device."
            : "This link is invalid or expired. Generate a new one from the dashboard."}
        </p>
      </div>

      {isValid && (
        <>
          {/* URL box */}
          <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
            <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider mb-2">
              Connect URL
            </p>
            <p className="text-white/70 text-xs font-mono break-all leading-relaxed mb-3">
              {connectUrl}
            </p>
            <CopyButton text={connectUrl} />
          </div>

          {/* Steps */}
          <div className="w-full max-w-sm space-y-5 mb-8">
            <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">
              How to connect
            </p>
            {steps.map(({ n, title, body }) => (
              <div key={n} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center mt-0.5">
                  {n}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium leading-snug">{title}</p>
                  {body}
                </div>
              </div>
            ))}
          </div>

          {/* Why not browser note */}
          <div className="w-full max-w-sm bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
            <div className="flex gap-2">
              <Smartphone className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-300 text-xs font-semibold">Why does this open in a browser?</p>
                <p className="text-amber-300/60 text-xs mt-1 leading-relaxed">
                  You scanned the QR with your camera app. The gateway runs inside the{" "}
                  <strong className="text-amber-300/80">SMS Gateway app</strong> — copy the
                  link above and paste it there to connect.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {!isValid && (
        <div className="w-full max-w-sm bg-red-500/10 border border-red-500/20 rounded-xl p-5 text-center">
          <p className="text-red-400 text-sm font-medium">
            Go to Dashboard → Devices → Connect to get a fresh QR code.
          </p>
        </div>
      )}
    </div>
  );
}
