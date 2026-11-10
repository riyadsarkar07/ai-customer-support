"use client";

import { useEffect, useRef } from "react";

export type RealtimeEvent =
  | { type: "conversation.created"; conversationId: string }
  | { type: "message.created"; conversationId: string; messageId: string }
  | { type: "conversation.updated"; conversationId: string }
  | { type: "notification"; notificationId: string };

export function useRealtime(
  onEvent: (event: RealtimeEvent) => void,
  enabled = true,
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      source = new EventSource("/api/realtime");
      source.onmessage = (e) => {
        try {
          handlerRef.current(JSON.parse(e.data) as RealtimeEvent);
        } catch {
          // ignore malformed events
        }
      };
      source.onerror = () => {
        source?.close();
        if (!stopped) retry = setTimeout(connect, 4000);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [enabled]);
}
