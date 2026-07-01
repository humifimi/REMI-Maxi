import { useCallback, useRef, useState } from "react";
import type { TranscriptEntry } from "@technician/types/copilot";

const MAX_ENTRIES = 100;

export function useVoiceTranscript() {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const pendingAssistantRef = useRef<string | null>(null);

  const addUserUtterance = useCallback((text: string) => {
    const entry: TranscriptEntry = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      text,
      timestamp: new Date(),
    };
    setEntries((prev) => [...prev.slice(-MAX_ENTRIES + 1), entry]);
  }, []);

  const startAssistantUtterance = useCallback(() => {
    const id = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    pendingAssistantRef.current = id;
    const entry: TranscriptEntry = {
      id,
      role: "assistant",
      text: "",
      timestamp: new Date(),
    };
    setEntries((prev) => [...prev.slice(-MAX_ENTRIES + 1), entry]);
    return id;
  }, []);

  const appendAssistantDelta = useCallback((delta: string) => {
    const id = pendingAssistantRef.current;
    if (!id) return;
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, text: e.text + delta } : e)),
    );
  }, []);

  const finalizeAssistantUtterance = useCallback(
    (fullText?: string) => {
      const id = pendingAssistantRef.current;
      if (!id) return;
      if (fullText) {
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, text: fullText } : e)),
        );
      }
      pendingAssistantRef.current = null;
    },
    [],
  );

  const clear = useCallback(() => {
    setEntries([]);
    pendingAssistantRef.current = null;
  }, []);

  return {
    entries,
    addUserUtterance,
    startAssistantUtterance,
    appendAssistantDelta,
    finalizeAssistantUtterance,
    clear,
  };
}
