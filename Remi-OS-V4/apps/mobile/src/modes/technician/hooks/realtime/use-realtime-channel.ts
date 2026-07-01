/**
 * `useRealtimeChannel` (P6-FE-1) — generic WebSocket channel
 * subscription primitive.
 *
 * Master plan §1.2.10 / §6.6 specify that all realtime hooks reuse
 * the same WS gateway (`/ws`, JWT first-message auth, `subscribe`
 * frame, 30s ping, auto-reconnect). The first concrete consumer
 * was `useRealtimeLocation` (live tech GPS,
 * `src/hooks/operations/use-realtime.ts`); P6-FE-1 adds a second
 * consumer (`useRealtimeReorganization`) that needs the same
 * connection lifecycle but a *different* per-message payload
 * shape.
 *
 * This primitive extracts the shared connection/handshake/keepalive
 * machinery so the reorganization hook does not have to duplicate
 * it. `useRealtimeLocation` is intentionally NOT migrated to this
 * primitive in P6-FE-1 — it is in production today and the
 * `LocationUpdate` shape is intertwined with its `useState`
 * surface; migrating it is a separate, mechanical refactor that
 * belongs in its own chunk so the bisect history stays clean.
 *
 * Surface contract:
 *   - `channel`: the channel string to subscribe to (e.g.
 *     `"franchise:1:reorganization"`). Pass `null` to disable.
 *   - `onMessage`: invoked for every framed message AFTER the
 *     handshake completes (i.e. NOT for `authenticated` /
 *     `subscribed` / `pong` / `error` envelopes — those are
 *     handled internally). The callback receives the parsed JSON
 *     object as `unknown`; the consumer narrows.
 *   - Returns `{ connected }` for debug surfaces only. The hook
 *     does NOT trigger re-renders on every inbound message —
 *     `onMessage` is the side-effect channel. This is critical for
 *     the calendar tab use case (§5.3.2): dozens of session-status
 *     events per hour on a busy franchise must not re-render the
 *     calendar canvas.
 *
 * Failure modes:
 *   - No `accessToken` → connect is a no-op; `connected` stays
 *     false. Reconnect retry will pick up the token once auth
 *     hydrates.
 *   - Network failure → `onclose` schedules a 3s reconnect, same as
 *     `useRealtimeLocation`. No console noise (per §6.6.4 "fire
 *     and forget").
 *   - Malformed inbound JSON → swallowed silently. Same as
 *     `useRealtimeLocation`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Config } from "@technician/constants/config";
import { useAuthStore } from "@/src/stores/auth";

const PING_INTERVAL_MS = 30_000;
const RECONNECT_DELAY_MS = 3_000;

export interface RealtimeChannelOptions {
  /**
   * Channel string; pass `null` to disable the subscription
   * entirely (e.g. while the user is logged out).
   */
  channel: string | null;
  /**
   * Invoked for every payload received on the channel after the
   * handshake completes. Internal control frames
   * (`authenticated`, `subscribed`, `pong`, `error`) are filtered
   * out — the callback only sees domain payloads.
   */
  onMessage: (payload: unknown) => void;
}

export interface RealtimeChannelHandle {
  /**
   * `true` once the channel-`subscribed` ack is received. Used
   * by debug HUDs only — domain code should not gate behavior on
   * this flag (the cache will refetch on reconnect).
   */
  connected: boolean;
}

const CONTROL_FRAME_TYPES = new Set([
  "authenticated",
  "subscribed",
  "unsubscribed",
  "pong",
  "error",
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
  // Latest `onMessage` so the connect callback (which closes over
  // it) is not a fresh reference every render — that would tear
  // the WS down on every parent re-render.
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

    const wsUrl = Config.API_BASE_URL.replace(/^http/, "ws") + "/ws";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      let msg: unknown;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (typeof msg !== "object" || msg === null) return;

      // Control-frame branch: keyed off `type`. The BE-side WS gateway
      // (REMIBackend `src/websocket/index.ts`) wraps every internal
      // frame as `{ type: ... }`, while domain payloads forwarded by
      // `realtimeService.onChannel(...)` (e.g. the §6.6.3 reorg
      // envelope `{ channel, event, session_id, session_summary, ... }`)
      // do NOT carry a `type` field. We dispatch on presence/absence
      // accordingly so adding new domain channels does not require
      // touching this primitive.
      const typeField =
        "type" in msg && typeof (msg as { type: unknown }).type === "string"
          ? (msg as { type: string }).type
          : null;

      if (typeField !== null) {
        switch (typeField) {
          case "authenticated":
            ws.send(JSON.stringify({ type: "subscribe", channel }));
            return;
          case "subscribed":
            setConnected(true);
            pingRef.current = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "ping" }));
              }
            }, PING_INTERVAL_MS);
            return;
          case "ping":
            // Server keepalive (§6.6.4 — every 90s). Reply with pong
            // so the BE idle-check sees us as alive.
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "pong" }));
            }
            return;
          default:
            if (CONTROL_FRAME_TYPES.has(typeField)) return;
            // Unknown `type` field — could be a future control frame
            // OR a domain payload that happens to carry a `type` (e.g.
            // `location_update`). Forward to consumer; consumers narrow.
            onMessageRef.current(msg);
            return;
        }
      }

      // No `type` field → §6.6.3 domain envelope. Forward as-is.
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
