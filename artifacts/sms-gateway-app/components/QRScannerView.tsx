/**
 * Web stub — QR camera scanning is not available in the browser.
 * The scanner screen shows the paste-URL fallback on web automatically.
 */
export type QRScanResult = { data: string };

export function QRScannerView({ onScanned }: { onScanned: (r: QRScanResult) => void }) {
  return null;
}

export function useCameraPermissions() {
  return [{ granted: false, canAskAgain: false, status: 'denied' as const }, async () => ({ granted: false })] as const;
}
