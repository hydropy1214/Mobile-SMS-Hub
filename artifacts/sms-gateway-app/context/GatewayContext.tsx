/**
 * GatewayContext — single source of truth for device connection, polling,
 * SMS dispatch, delivery tracking, and device telemetry.
 *
 * One connection method: parse a dashboard connect URL (from QR or paste).
 * URL format: https://<server>/mobile?deviceId=<id>&token=<token>
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SMS from 'expo-sms';
import * as Haptics from 'expo-haptics';
import * as Battery from 'expo-battery';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConnectionDetails {
  serverUrl: string;   // e.g. https://xxx.replit.dev
  deviceId: number;
  token: string;
  deviceName?: string;
}

export type SimLabel = 'SIM 1' | 'SIM 2' | 'Default SIM';

function toSimLabel(slot: number | null | undefined): SimLabel {
  if (slot === 0) return 'SIM 1';
  if (slot === 1) return 'SIM 2';
  return 'Default SIM';
}

export interface CurrentMessage {
  id: number;
  phone: string;
  text: string;
  simLabel: SimLabel;
}

export type MessageStatus = 'sending' | 'sent' | 'failed';

export interface ActivityEntry {
  uid: string;
  messageId: number;
  phone: string;
  text: string;
  simLabel: SimLabel;
  status: MessageStatus;
  timestamp: number;
}

export type GatewayStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface GatewayStats {
  sent: number;
  failed: number;
  pending: number;
}

interface GatewayContextValue {
  status: GatewayStatus;
  connectionDetails: ConnectionDetails | null;
  currentMessage: CurrentMessage | null;
  stats: GatewayStats;
  activity: ActivityEntry[];
  batteryLevel: number | null;   // 0–100, null if unavailable
  pollError: boolean;             // true when last N polls failed
  errorMessage: string | null;
  /** Parse a dashboard connect URL and establish connection */
  connect: (connectUrl: string) => Promise<void>;
  disconnect: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = '@sms_gateway_v2';
const POLL_INTERVAL_MS = 4_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const BATTERY_INTERVAL_MS = 30_000;
const MAX_ACTIVITY = 80;
const POLL_ERROR_THRESHOLD = 3;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function wsUrlOf(serverUrl: string) {
  return serverUrl.replace(/^https/, 'wss').replace(/^http(?!s)/, 'ws') + '/api/ws';
}

async function getBattery(): Promise<number | null> {
  if (Platform.OS === 'web') return null;
  try {
    const level = await Battery.getBatteryLevelAsync();
    if (level < 0) return null;
    return Math.round(level * 100);
  } catch {
    return null;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const GatewayCtx = createContext<GatewayContextValue | null>(null);

export function GatewayProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<GatewayStatus>('idle');
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  const [currentMessage, setCurrentMessage] = useState<CurrentMessage | null>(null);
  const [stats, setStats] = useState<GatewayStats>({ sent: 0, failed: 0, pending: 0 });
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [pollError, setPollError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stable mutable refs — never stale inside callbacks
  const connRef = useRef<ConnectionDetails | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batteryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aliveRef = useRef(false);          // true while connected, gates reconnect
  const processingRef = useRef<Set<number>>(new Set());  // in-flight message IDs
  const handledRef = useRef<Set<number>>(new Set());     // already dispatched, prevents re-send
  const pollErrorCountRef = useRef(0);

  // ── Activity helpers ─────────────────────────────────────────────────────

  const addActivity = useCallback((entry: Omit<ActivityEntry, 'uid'>) => {
    setActivity(prev => [{ ...entry, uid: uid() }, ...prev].slice(0, MAX_ACTIVITY));
  }, []);

  const updateActivity = useCallback((messageId: number, status: MessageStatus) => {
    setActivity(prev => prev.map(a => a.messageId === messageId ? { ...a, status } : a));
  }, []);

  // ── API ──────────────────────────────────────────────────────────────────

  const api = useCallback((path: string, method = 'GET', body?: object) => {
    const d = connRef.current;
    if (!d) return Promise.reject(new Error('Not connected'));
    return fetch(`${d.serverUrl}/api/native/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${d.token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }, []);

  // ── SMS dispatch ─────────────────────────────────────────────────────────

  const dispatch = useCallback(async (msg: {
    id: number;
    phoneNumber: string;
    messageText: string;
    simSlot?: number | null;
  }) => {
    if (processingRef.current.has(msg.id) || handledRef.current.has(msg.id)) return;
    processingRef.current.add(msg.id);

    const simLabel = toSimLabel(msg.simSlot);

    setCurrentMessage({ id: msg.id, phone: msg.phoneNumber, text: msg.messageText, simLabel });
    addActivity({
      messageId: msg.id,
      phone: msg.phoneNumber,
      text: msg.messageText,
      simLabel,
      status: 'sending',
      timestamp: Date.now(),
    });
    setStats(s => ({ ...s, pending: Math.max(0, s.pending - 1) }));

    // Haptic cue so user knows something needs attention
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

    let finalStatus: MessageStatus = 'failed';

    try {
      if (Platform.OS !== 'web') {
        const available = await SMS.isAvailableAsync();
        if (available) {
          const { result } = await SMS.sendSMSAsync([msg.phoneNumber], msg.messageText);
          // 'cancelled' means user explicitly cancelled. 'unknown' typically means sent on Android.
          finalStatus = result === 'cancelled' ? 'failed' : 'sent';
        }
      } else {
        // Web: simulate sent (demo/preview only)
        finalStatus = 'sent';
      }
    } catch (err) {
      finalStatus = 'failed';
    }

    // Mark as handled before PATCH so any duplicate poll fetch is rejected
    handledRef.current.add(msg.id);

    // Report delivery back to server — retry once on failure
    let reported = false;
    for (let attempt = 0; attempt < 2 && !reported; attempt++) {
      try {
        const res = await api(`/messages/${msg.id}`, 'PATCH', { status: finalStatus });
        if (res.ok) reported = true;
      } catch { /* retry */ }
    }

    updateActivity(msg.id, finalStatus);
    Haptics.impactAsync(
      finalStatus === 'sent'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Heavy
    ).catch(() => {});

    setStats(s => ({
      ...s,
      sent: finalStatus === 'sent' ? s.sent + 1 : s.sent,
      failed: finalStatus === 'failed' ? s.failed + 1 : s.failed,
    }));

    setCurrentMessage(null);
    processingRef.current.delete(msg.id);
  }, [api, addActivity, updateActivity]);

  // ── Polling ──────────────────────────────────────────────────────────────

  const poll = useCallback(async () => {
    if (!connRef.current) return;
    try {
      const res = await api('/messages');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const messages: { id: number; phoneNumber: string; messageText: string; simSlot?: number | null }[]
        = await res.json();

      pollErrorCountRef.current = 0;
      setPollError(false);

      const fresh = messages.filter(m => !handledRef.current.has(m.id));
      setStats(s => ({ ...s, pending: fresh.filter(m => !processingRef.current.has(m.id)).length }));
      fresh.forEach(m => dispatch(m));
    } catch {
      pollErrorCountRef.current += 1;
      if (pollErrorCountRef.current >= POLL_ERROR_THRESHOLD) setPollError(true);
    }
  }, [api, dispatch]);

  // ── Heartbeat ────────────────────────────────────────────────────────────

  const heartbeat = useCallback(async () => {
    if (!connRef.current) return;
    const bat = batteryLevel;
    try {
      await api('/heartbeat', 'POST', {
        batteryLevel: bat,
        signalStrength: null,
      });
    } catch { /* non-critical */ }
  }, [api, batteryLevel]);

  // ── Battery polling ──────────────────────────────────────────────────────

  const refreshBattery = useCallback(async () => {
    const level = await getBattery();
    if (level !== null) setBatteryLevel(level);
  }, []);

  // ── WebSocket ────────────────────────────────────────────────────────────

  const openWs = useCallback((details: ConnectionDetails) => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
    }
    try {
      const ws = new WebSocket(wsUrlOf(details.serverUrl));
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          event: 'device:register',
          deviceId: details.deviceId,
          token: details.token,
        }));
      };

      ws.onmessage = event => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.event === 'sms:dispatch' && msg.data) {
            dispatch({
              id: msg.data.messageId,
              phoneNumber: msg.data.phoneNumber,
              messageText: msg.data.messageText,
              simSlot: msg.data.simSlot ?? null,
            });
          }
        } catch { /* malformed frame */ }
      };

      ws.onerror = () => { /* errors surface in onclose */ };

      ws.onclose = () => {
        if (!aliveRef.current) return;
        // Reconnect after 5 s — gates on aliveRef so disconnect() stops it
        wsReconnRef.current = setTimeout(() => {
          if (aliveRef.current && connRef.current) openWs(connRef.current);
        }, 5_000);
      };
    } catch { /* WebSocket not available (e.g. web without wss) */ }
  }, [dispatch]);

  // ── Core connect flow ────────────────────────────────────────────────────

  const startSession = useCallback(async (details: ConnectionDetails) => {
    connRef.current = details;
    aliveRef.current = false;
    setConnectionDetails(details);
    setStatus('connecting');
    setErrorMessage(null);
    setPollError(false);
    pollErrorCountRef.current = 0;

    // Validate token against the native API
    let validated = false;
    try {
      const res = await fetch(`${details.serverUrl}/api/native/v1/messages`, {
        headers: { Authorization: `Bearer ${details.token}` },
        signal: AbortSignal.timeout(8_000),
      });
      validated = res.ok;
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      setStatus('error');
      setErrorMessage(
        isTimeout
          ? 'Server took too long to respond. Check your network connection.'
          : "Can't reach the server. Make sure your dashboard is running."
      );
      connRef.current = null;
      return;
    }

    if (!validated) {
      setStatus('error');
      setErrorMessage('Connection rejected — the QR code may be expired. Regenerate it from the dashboard.');
      connRef.current = null;
      return;
    }

    // Connected
    aliveRef.current = true;
    setStatus('connected');

    // Kick off WebSocket, polling, heartbeat, battery
    openWs(details);

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    poll();

    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    heartbeat();

    await refreshBattery();
    if (batteryRef.current) clearInterval(batteryRef.current);
    batteryRef.current = setInterval(refreshBattery, BATTERY_INTERVAL_MS);
  }, [openWs, poll, heartbeat, refreshBattery]);

  // ── Public: connect ──────────────────────────────────────────────────────

  const connect = useCallback(async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      setStatus('error');
      setErrorMessage('No URL found. Scan the QR code from your dashboard or paste the connect link.');
      return;
    }

    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      setStatus('error');
      setErrorMessage('Invalid URL. Scan the QR code from the dashboard Devices page.');
      return;
    }

    const token = url.searchParams.get('token');
    const deviceIdStr = url.searchParams.get('deviceId');

    if (!token) {
      setStatus('error');
      setErrorMessage('QR code is missing the device token. Try regenerating it from the dashboard.');
      return;
    }

    const deviceId = parseInt(deviceIdStr ?? '0', 10);
    const serverUrl = url.origin;

    const details: ConnectionDetails = { serverUrl, deviceId, token };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(details)).catch(() => {});
    await startSession(details);
  }, [startSession]);

  // ── Public: disconnect ───────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    aliveRef.current = false;
    connRef.current = null;

    if (wsReconnRef.current) clearTimeout(wsReconnRef.current);
    try { wsRef.current?.close(); } catch { /* ignore */ }
    wsRef.current = null;

    [pollRef, heartbeatRef, batteryRef].forEach(r => {
      if (r.current) clearInterval(r.current);
      r.current = null;
    });

    processingRef.current.clear();
    handledRef.current.clear();
    pollErrorCountRef.current = 0;

    setConnectionDetails(null);
    setCurrentMessage(null);
    setStatus('idle');
    setStats({ sent: 0, failed: 0, pending: 0 });
    setActivity([]);
    setBatteryLevel(null);
    setPollError(false);
    setErrorMessage(null);

    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  // ── Auto-restore on mount ────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => { if (raw) startSession(JSON.parse(raw)); })
      .catch(() => {});

    return () => {
      aliveRef.current = false;
      if (wsReconnRef.current) clearTimeout(wsReconnRef.current);
      try { wsRef.current?.close(); } catch { /* ignore */ }
      [pollRef, heartbeatRef, batteryRef].forEach(r => {
        if (r.current) clearInterval(r.current);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GatewayCtx.Provider value={{
      status, connectionDetails, currentMessage, stats,
      activity, batteryLevel, pollError, errorMessage,
      connect, disconnect,
    }}>
      {children}
    </GatewayCtx.Provider>
  );
}

export function useGateway() {
  const ctx = useContext(GatewayCtx);
  if (!ctx) throw new Error('useGateway must be inside GatewayProvider');
  return ctx;
}
