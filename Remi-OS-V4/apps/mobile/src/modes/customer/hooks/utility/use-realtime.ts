import { useEffect, useRef, useCallback, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { SECURE_STORE_KEYS, API_BASE_URL } from '@customer/constants/config';
import type { LocationUpdate } from '@customer/types/api';

export function useRealtimeLocation(channel: string | null) {
  const [lastUpdate, setLastUpdate] = useState<LocationUpdate | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(async () => {
    if (!channel) return;

    const token = await SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
    if (!token) return;

    const baseHost = API_BASE_URL
      .replace(/\/api\/v1\/customer$/, '')
      .replace(/^http/, 'ws');
    const wsUrl = `${baseHost}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'authenticated') {
        ws.send(JSON.stringify({ type: 'subscribe', channel }));
      } else if (msg.type === 'subscribed') {
        setConnected(true);
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30_000);
      } else if (msg.type === 'location_update') {
        setLastUpdate(msg as LocationUpdate);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (pingRef.current) clearInterval(pingRef.current);
      reconnectRef.current = setTimeout(connect, 3_000);
    };

    ws.onerror = () => ws.close();
  }, [channel]);

  useEffect(() => {
    connect();
    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { lastUpdate, connected };
}
