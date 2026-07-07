/**
 * Native (Android/iOS) — real QR scanner using expo-camera.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions as _useCameraPermissions } from 'expo-camera';

export type QRScanResult = { data: string };

export function QRScannerView({ onScanned }: { onScanned: (r: QRScanResult) => void }) {
  return (
    <CameraView
      style={StyleSheet.absoluteFill}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={onScanned}
    />
  );
}

export { _useCameraPermissions as useCameraPermissions };
