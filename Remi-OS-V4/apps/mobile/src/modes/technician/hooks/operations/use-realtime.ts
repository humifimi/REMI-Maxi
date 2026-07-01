import { useEffect, useRef, useCallback, useState } from "react";
import { useAuthStore } from "@/src/stores/auth";
import { Config } from "@technician/constants/config";

export interface LocationUpdate {
  technicianId: number;
  technicianName: string;
  lat: number;
  lng: number;
  timestamp: string;
}

const PING_INTERVAL_MS = 30_000;
const RECONNECT_DELAY_MS = 3_000;

export function useRealtimeLocation(channel: string | null) {
  const [lastUpdate, setLastUpdate] = useState<LocationUpdate | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pingRef.current) {
      clearInterval(pingRef.current);
      pingRef.current = null;
    }
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!channel || unmountedRef.current) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    cleanup();

    const wsUrl = Config.API_BASE_URL.replace(/^http/, "ws") + "/ws";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        switch (msg.type) {
          case "authenticated":
            ws.send(JSON.stringify({ type: "subscribe", channel }));
            break;
          case "subscribed":
            setConnected(true);
            pingRef.current = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "ping" }));
              }
            }, PING_INTERVAL_MS);
            break;
          case "location_update":
            setLastUpdate({
              technicianId: msg.technicianId,
              technicianName: msg.technicianName,
              lat: msg.lat,
              lng: msg.lng,
              timestamp: msg.timestamp,
            });
            break;
        }
      } catch {
        // Malformed message -- ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (pingRef.current) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }
      if (!unmountedRef.current) {
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [channel, cleanup]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      cleanup();
    };
  }, [connect, cleanup]);

  return { lastUpdate, connected };
}
