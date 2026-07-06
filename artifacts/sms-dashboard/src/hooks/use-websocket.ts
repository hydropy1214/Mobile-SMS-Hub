import { useEffect, useRef, useCallback } from "react";

type WsEventHandler = (data: unknown) => void;

interface WsMessage {
  event: string;
  data: unknown;
  ts: string;
}

const RECONNECT_DELAY_MS = 3000;

let socket: WebSocket | null = null;
const listeners = new Map<string, Set<WsEventHandler>>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws`;
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  socket = new WebSocket(getWsUrl());

  socket.onmessage = (event) => {
    try {
      const msg: WsMessage = JSON.parse(event.data as string);
      const handlers = listeners.get(msg.event);
      if (handlers) {
        handlers.forEach((fn) => fn(msg.data));
      }
      // Also fire wildcard listeners
      const wildcard = listeners.get("*");
      if (wildcard) {
        wildcard.forEach((fn) => fn(msg));
      }
    } catch {
      // ignore parse errors
    }
  };

  socket.onclose = () => {
    socket = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
  };

  socket.onerror = () => {
    socket?.close();
  };
}

// Start connecting immediately when this module is loaded
if (typeof window !== "undefined") {
  connect();
}

/**
 * Hook to subscribe to WebSocket events.
 * `event` can be a specific event name or "*" for all events.
 */
export function useWebSocket(event: string, handler: WsEventHandler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const stable = useCallback((data: unknown) => {
    handlerRef.current(data);
  }, []);

  useEffect(() => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(stable);
    return () => {
      listeners.get(event)?.delete(stable);
    };
  }, [event, stable]);
}
