import { useEffect, useRef, useCallback } from "react";
import { Alert, Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/src/stores/auth";
import { Config } from "@technician/constants/config";

interface StockAlertPayload {
  type: "stock_alert";
  appointment_id: number;
  customer_name: string | null;
  scheduled_time: string | null;
  shortages: {
    itemName: string;
    needed: number;
    available: number;
    status: "low" | "out";
  }[];
}

/**
 * Subscribes to the technician's WebSocket channel and listens for
 * stock_alert events. Shows an in-app alert and invalidates briefing +
 * route queries so the UI reflects the new stock state.
 */
export function useStockAlerts() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.user?.userId);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);

  const handleStockAlert = useCallback(
    (payload: StockAlertPayload) => {
      queryClient.invalidateQueries({ queryKey: ["briefing"] });
      queryClient.invalidateQueries({ queryKey: ["franchise-briefing"] });
      queryClient.invalidateQueries({ queryKey: ["routes"] });

      const customer = payload.customer_name ?? "Unknown";
      const outCount = payload.shortages.filter(
        (s) => s.status === "out",
      ).length;
      const lowCount = payload.shortages.length - outCount;

      const parts = [
        outCount > 0 && `${outCount} out of stock`,
        lowCount > 0 && `${lowCount} low`,
      ]
        .filter(Boolean)
        .join(", ");

      Alert.alert(
        `Stock Alert — ${customer}`,
        `${parts}. Tap to review your briefing.`,
        [{ text: "OK" }],
      );
    },
    [queryClient],
  );

  const connect = useCallback(() => {
    if (!isAuthenticated || !accessToken || !userId) return;

    const wsBase = Config.API_BASE_URL.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsBase}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempts.current = 0;
      ws.send(JSON.stringify({ type: "auth", token: accessToken }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "authenticated") {
          ws.send(
            JSON.stringify({
              type: "subscribe",
              channel: `technician:${userId}`,
            }),
          );
        } else if (msg.type === "stock_alert") {
          handleStockAlert(msg as StockAlertPayload);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      const delay = Math.min(
        30_000,
        1000 * Math.pow(2, reconnectAttempts.current),
      );
      reconnectAttempts.current += 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [isAuthenticated, accessToken, userId, handleStockAlert]);

  useEffect(() => {
    if (!isAuthenticated) return;

    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isAuthenticated, connect]);
}
