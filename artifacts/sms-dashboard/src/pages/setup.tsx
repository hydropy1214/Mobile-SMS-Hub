/**
 * /setup — legacy redirect. Old QR codes encoded /setup; forward to /mobile
 * so they still work after the gateway was moved to the native app.
 */
import { useEffect } from "react";

export default function SetupPage() {
  useEffect(() => {
    // Preserve all query params (deviceId, token) and redirect instantly
    const dest = "/mobile" + window.location.search;
    window.location.replace(dest);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d1117",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Redirecting…</p>
    </div>
  );
}
