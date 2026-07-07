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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConnectionDetails {
  serverUrl: string; // e.g. https://xxx.replit.dev
  deviceId: number;
  token: string;
}

export interface ActivityEntry {
  id: string;
  messageId: number;
  phone: string;
  text: string;
  status: 'sending' | 'sent' | 'failed';
  timestamp: number;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface GatewayStats {
  sent: number;
  failed: number;
  pending: number;
}

interface GatewayContextValue {
  connectionDetails: ConnectionDetails | null;
  status: ConnectionStatus;
  stats: GatewayStats;
  activity: ActivityEntry[];
  errorMessage: string | null;
  connect: (connectUrl: string) => Promise<void>;
  connectManual: (serverUrl: string, deviceId: string, token: string) => Promise<void>;
  disconnect: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = '@sms_gateway_v1';

function makeId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function toWsUrl(serverUrl: string) {
  return serverUrl.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/api/ws';
}

// ── Context ───────────────────────────────────────────────────────────────────

const GatewayContext = createContext<GatewayContextValue | null>(null);

export function GatewayProvider({ children }: { children: React.ReactNode }) {
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [stats, setStats] = useState<GatewayStats>({ sent: 0, failed: 0, pending: 0 });
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs for stable access inside callbacks
  const connRef = useRef<ConnectionDetails | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingRef = useRef<Set<number>>(new Set());
  // Persists sent IDs across polls to prevent double-send on PATCH failure
  const sentIdsRef = useRef<Set<number>>(new Set());
  const isConnectedRef = useRef(false);

  // ── Activity helpers ───────────────────────────────────────────────────────

  const addEntry = (entry: Omit<ActivityEntry, 'id'>) => {
    setActivity((prev) => [{ ...entry, id: makeId() }, ...prev].slice(0, 60));
  };

  const updateEntry = (messageId: number, newStatus: ActivityEntry['status']) => {
    setActivity((prev) =>
      prev.map((a) => (a.messageId === messageId ? { ...a, status: newStatus } : a))
    );
  };

  // ── API helper ────────────────────────────────────────────────────────────

  const apiCall = (path: string, method = 'GET', body?: object) => {
    const d = connRef.current;
    if (!d) return Promise.reject(new Error('Not connected'));
    return fetch(`${d.serverUrl}/api/native/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${d.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  // ── Message processing ────────────────────────────────────────────────────

  const processMessage = useCallback(
    async (msg: { id: number; phoneNumber: string; messageText: string }) => {
      if (processingRef.current.has(msg.id) || sentIdsRef.current.has(msg.id)) return;
      processingRef.current.add(msg.id);

      addEntry({ messageId: msg.id, phone: msg.phoneNumber, text: msg.messageText, status: 'sending', timestamp: Date.now() });
      setStats((s) => ({ ...s, pending: Math.max(0, s.pending - 1) }));

      let finalStatus: 'sent' | 'failed' = 'failed';
      try {
        if (Platform.OS !== 'web') {
          const available = await SMS.isAvailableAsync();
          if (available) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const { result } = await SMS.sendSMSAsync([msg.phoneNumber], msg.messageText);
            finalStatus = result === 'cancelled' ? 'failed' : 'sent';
          }
        } else {
          finalStatus = 'sent';
        }
      } catch {
        finalStatus = 'failed';
      }

      // Report back to server
      try { await apiCall(`/messages/${msg.id}`, 'PATCH', { status: finalStatus }); } catch {}

      // Track as permanently handled so duplicate polls never re-send
      sentIdsRef.current.add(msg.id);

      updateEntry(msg.id, finalStatus);
      setStats((s) => ({
        ...s,
        sent: finalStatus === 'sent' ? s.sent + 1 : s.sent,
        failed: finalStatus === 'failed' ? s.failed + 1 : s.failed,
      }));
      processingRef.current.delete(msg.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Polling ───────────────────────────────────────────────────────────────

  const poll = useCallback(async () => {
    if (!connRef.current) return;
    try {
      const res = await apiCall('/messages');
      if (!res.ok) return;
      const messages: { id: number; phoneNumber: string; messageText: string }[] = await res.json();
      setStats((s) => ({ ...s, pending: messages.filter((m) => !processingRef.current.has(m.id)).length }));
      messages.forEach((m) => processMessage(m));
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processMessage]);

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  const heartbeat = useCallback(() => {
    if (!connRef.current) return;
    apiCall('/heartbeat', 'POST', { batteryLevel: null, signalStrength: null }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const openWs = useCallback(
    (details: ConnectionDetails) => {
      if (wsRef.current) { try { wsRef.current.close(); } catch {} }
      try {
        const ws = new WebSocket(toWsUrl(details.serverUrl));
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ event: 'device:register', deviceId: details.deviceId, token: details.token }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string);
            if (msg.event === 'sms:dispatch' && msg.data) {
              processMessage({ id: msg.data.messageId, phoneNumber: msg.data.phoneNumber, messageText: msg.data.messageText });
            }
          } catch {}
        };

        ws.onerror = () => {};
        ws.onclose = () => {
          if (isConnectedRef.current && connRef.current) {
            wsReconnectTimerRef.current = setTimeout(() => {
              if (connRef.current) openWs(connRef.current);
            }, 5000);
          }
        };
      } catch {}
    },
    [processMessage]
  );

  // ── Core connect flow ─────────────────────────────────────────────────────

  const startConnection = useCallback(
    async (details: ConnectionDetails) => {
      connRef.current = details;
      isConnectedRef.current = false;
      setConnectionDetails(details);
      setStatus('connecting');
      setErrorMessage(null);

      // Validate token
      try {
        const res = await fetch(`${details.serverUrl}/api/native/v1/messages`, {
          headers: { Authorization: `Bearer ${details.token}` },
        });
        if (!res.ok) {
          setStatus('error');
          setErrorMessage('Token rejected by server. Check the URL.');
          connRef.current = null;
          return;
        }
      } catch {
        setStatus('error');
        setErrorMessage("Can't reach the server. Check the URL and your connection.");
        connRef.current = null;
        return;
      }

      setStatus('connected');
      isConnectedRef.current = true;

      openWs(details);

      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(poll, 4000);
      poll();

      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      heartbeat();
      heartbeatTimerRef.current = setInterval(heartbeat, 20000);
    },
    [openWs, poll, heartbeat]
  );

  // ── Public API ────────────────────────────────────────────────────────────

  const connect = useCallback(
    async (connectUrl: string) => {
      try {
        const url = new URL(connectUrl.trim());
        const serverUrl = url.origin;
        const deviceId = parseInt(url.searchParams.get('deviceId') ?? '0', 10);
        const token = url.searchParams.get('token') ?? '';

        if (!token) {
          setStatus('error');
          setErrorMessage('No token found in URL. Copy the full link from the dashboard.');
          return;
        }

        const details: ConnectionDetails = { serverUrl, deviceId, token };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(details));
        await startConnection(details);
      } catch {
        setStatus('error');
        setErrorMessage('Invalid URL. Paste the full connect link from your dashboard.');
      }
    },
    [startConnection]
  );

  const connectManual = useCallback(
    async (serverUrl: string, deviceId: string, token: string) => {
      const details: ConnectionDetails = {
        serverUrl: serverUrl.trim().replace(/\/$/, ''),
        deviceId: parseInt(deviceId, 10) || 0,
        token: token.trim(),
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(details));
      await startConnection(details);
    },
    [startConnection]
  );

  const disconnect = useCallback(() => {
    isConnectedRef.current = false;
    connRef.current = null;
    if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current);
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    processingRef.current.clear();
    sentIdsRef.current.clear();
    setConnectionDetails(null);
    setStatus('idle');
    setStats({ sent: 0, failed: 0, pending: 0 });
    setActivity([]);
    setErrorMessage(null);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  // ── Auto-restore on mount ─────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => { if (raw) startConnection(JSON.parse(raw)); })
      .catch(() => {});
    return () => {
      isConnectedRef.current = false;
      if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current);
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GatewayContext.Provider
      value={{ connectionDetails, status, stats, activity, errorMessage, connect, connectManual, disconnect }}
    >
      {children}
    </GatewayContext.Provider>
  );
}

export function useGateway() {
  const ctx = useContext(GatewayContext);
  if (!ctx) throw new Error('useGateway must be used within GatewayProvider');
  return ctx;
}
