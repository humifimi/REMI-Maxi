/**
 * `useRealtimeChannel` — generic WebSocket channel subscription
 * primitive for the customer app.
 *
 * Mirrors the REMITechnician implementation
 * (`/Users/jacegalloway/Documents/codebases/REMITechnician/src/hooks/realtime/use-realtime-channel.ts`)
 * one-to-one — keep them in sync. The differences are:
 *   - This app's `API_BASE_URL` includes the `/api/v1/customer`
 *     route prefix; the backend WS gateway lives at `/ws` on the
 *     bare host, so we strip the prefix before swapping protocols.
 *   - Token is read directly from the in-memory auth store (which
 *     is hydrated from SecureStore on app start), mirroring the
 *     tech app. The legacy `use-realtime.ts` consumer does an
 *     async SecureStore lookup; that's an older pattern.
 *
 * Surface contract is identical to the tech version:
 *   - `channel`: pass `null` to disable.
 *   - `onMessage`: invoked for every domain payload AFTER
 *     handshake; control frames (`authenticated`/`subscribed`/
 *     `pong`/`error`) are filtered internally.
 *   - Returns `{ connected }` for debug only — `onMessage` is the
 *     side-effect channel; this hook does NOT re-render on every
 *     inbound payload.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { API_BASE_URL } from '@customer/constants/config';
import { useAuthStore } from '@/src/stores/auth';

const PING_INTERVAL_MS = 30_000;
const RECONNECT_DELAY_MS = 3_000;

export interface RealtimeChannelOptions {
  channel: string | null;
  onMessage: (payload: unknown) => void;
}

export interface RealtimeChannelHandle {
  connected: boolean;
}

const CONTROL_FRAME_TYPES = new Set([
  'authenticated',
  'subscribed',
  'unsubscribed',
  'pong',
  'error',
]);

export function useRealtimeChannel(
  options: RealtimeChannelOptions,
): RealtimeChannelHandle {
  const { channel, onMessage } = options;

  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

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

    // Strip the `/api/v1/customer` route prefix and swap protocol so the
    // resulting URL points at the backend's bare-host `/ws` gateway.
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
      let msg: unknown;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (typeof msg !== 'object' || msg === null) return;

      const typeField =
        'type' in msg && typeof (msg as { type: unknown }).type === 'string'
          ? (msg as { type: string }).type
          : null;

      if (typeField !== null) {
        switch (typeField) {
          case 'authenticated':
            ws.send(JSON.stringify({ type: 'subscribe', channel }));
            return;
          case 'subscribed':
            setConnected(true);
            pingRef.current = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
              }
            }, PING_INTERVAL_MS);
            return;
          case 'ping':
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
            return;
          default:
            if (CONTROL_FRAME_TYPES.has(typeField)) return;
            onMessageRef.current(msg);
            return;
        }
      }

      onMessageRef.current(msg);
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

  return { connected };
}
