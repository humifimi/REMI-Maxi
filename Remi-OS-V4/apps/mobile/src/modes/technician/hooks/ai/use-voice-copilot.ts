import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
// PLAN-DEVIATION: 2026-04-26-ask-remi-session-wire (round 3 — voice route in Expo Go).
// See docs/PLAN-DEVIATIONS.md#2026-04-26-ask-remi-session-wire for context.
// `react-native-webrtc` is a NATIVE module that does NOT exist in Expo Go.
// Eagerly importing its value exports at the top of this file crashes the
// JS bundle at MODULE-EVALUATION time — and because expo-router scans
// every file under `app/` to register routes (see
// app/copilot/voice.tsx → useVoiceCopilot import chain), that crash fires
// on app start, before the user ever taps the mic. The "Route is missing
// the required default export" warning + the Invariant Violation in the
// logs are both symptoms of the same eager-import boom.
//
// The fix is twofold:
//   1. Use `import type` for the symbols we only need for type-checking
//      (these are erased at compile time, no runtime native access).
//   2. Lazy-require the value exports inside `loadWebrtc()`, swallowing
//      the load error so module evaluation succeeds on Expo Go and the
//      route stays registered. `startSession` short-circuits with a
//      helpful error if the module isn't available.
//
// On EAS builds (preview / production) the require succeeds and behavior
// is identical to the previous eager import. The voice mic in chat.tsx is
// also hidden in Expo Go to keep users from landing in a dead-end UI;
// this hook fix is the actual root-cause fix for the route-registration
// crash that the mic-hide was working around.
import type {
  RTCPeerConnection as RTCPeerConnectionCtor,
  MediaStream as MediaStreamType,
  mediaDevices as MediaDevicesType,
} from "react-native-webrtc";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { useVoiceTranscript } from "./use-voice-transcript";
import type {
  VoiceConnectionState,
  VoiceSessionResponse,
  VoiceToolCallResponse,
} from "@technician/types/copilot";

interface WebrtcModule {
  RTCPeerConnection: typeof RTCPeerConnectionCtor;
  mediaDevices: typeof MediaDevicesType;
  MediaStream: typeof MediaStreamType;
}

let webrtcModule: WebrtcModule | null | undefined;
function loadWebrtc(): WebrtcModule | null {
  if (webrtcModule !== undefined) return webrtcModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    webrtcModule = require("react-native-webrtc") as WebrtcModule;
  } catch {
    webrtcModule = null;
  }
  return webrtcModule;
}

const OPENAI_REALTIME_URL = "https://api.openai.com/v1/realtime";
const SESSION_MAX_MS = 5 * 60 * 1000;
const SESSION_WARN_MS = 4.5 * 60 * 1000;

interface DataChannelEvent {
  type: string;
  [key: string]: unknown;
}

export function useVoiceCopilot() {
  const [connectionState, setConnectionState] =
    useState<VoiceConnectionState>("idle");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionDurationMs, setSessionDurationMs] = useState(0);

  const transcript = useVoiceTranscript();

  const pcRef = useRef<InstanceType<typeof RTCPeerConnectionCtor> | null>(null);
  const dcRef = useRef<ReturnType<
    InstanceType<typeof RTCPeerConnectionCtor>["createDataChannel"]
  > | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warnedRef = useRef(false);
  const closingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (dcRef.current) {
      try { dcRef.current.close(); } catch { /* noop */ }
      dcRef.current = null;
    }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch { /* noop */ }
      pcRef.current = null;
    }
    sessionIdRef.current = null;
    sessionStartRef.current = 0;
    warnedRef.current = false;
    closingRef.current = false;
    setIsAiSpeaking(false);
    setSessionDurationMs(0);
  }, []);

  const reportSessionEnd = useCallback(async () => {
    const sid = sessionIdRef.current;
    const elapsed = sessionStartRef.current
      ? Math.round((Date.now() - sessionStartRef.current) / 1000)
      : 0;
    if (!sid || elapsed === 0) return;
    try {
      await api("post", Endpoints.copilot.voiceSession + "/end", {
        session_id: sid,
        duration_seconds: elapsed,
      });
    } catch { /* best effort */ }
  }, []);

  const disconnect = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    await reportSessionEnd();
    cleanup();
    setConnectionState("disconnected");
    haptic.light();
  }, [reportSessionEnd, cleanup]);

  const handleDataChannelMessage = useCallback(
    async (event: { data: string }) => {
      let parsed: DataChannelEvent;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (parsed.type) {
        case "response.audio_transcript.delta": {
          const delta = parsed.delta as string | undefined;
          if (delta) transcript.appendAssistantDelta(delta);
          break;
        }

        case "response.audio.started":
          setIsAiSpeaking(true);
          haptic.medium();
          break;

        case "response.audio.done":
          setIsAiSpeaking(false);
          transcript.finalizeAssistantUtterance();
          break;

        case "response.created":
          transcript.startAssistantUtterance();
          break;

        case "input_audio_transcription.completed": {
          const text = parsed.transcript as string | undefined;
          if (text) transcript.addUserUtterance(text);
          break;
        }

        case "response.function_call_arguments.done": {
          const toolName = parsed.name as string;
          const toolCallId = parsed.call_id as string;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(parsed.arguments as string);
          } catch { /* noop */ }
          await executeToolCall(toolName, args, toolCallId);
          break;
        }

        case "session.warning": {
          // Session nearing end — AI already voiced a warning
          break;
        }

        default:
          break;
      }
    },
    [transcript],
  );

  const executeToolCall = useCallback(
    async (
      toolName: string,
      args: Record<string, unknown>,
      toolCallId: string,
    ) => {
      const sid = sessionIdRef.current;
      if (!sid) return;

      try {
        const result = await api<VoiceToolCallResponse>(
          "post",
          Endpoints.copilot.voiceToolCall,
          {
            tool_name: toolName,
            arguments: args,
            tool_call_id: toolCallId,
            session_id: sid,
          },
        );

        const dc = dcRef.current;
        if (dc && dc.readyState === "open") {
          dc.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: toolCallId,
                output: JSON.stringify(result.result),
              },
            }),
          );
          dc.send(JSON.stringify({ type: "response.create" }));
        }
      } catch {
        const dc = dcRef.current;
        if (dc && dc.readyState === "open") {
          dc.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: toolCallId,
                output: JSON.stringify({ error: "Tool execution failed" }),
              },
            }),
          );
          dc.send(JSON.stringify({ type: "response.create" }));
        }
      }
    },
    [],
  );

  const startSession = useCallback(
    async (appointmentId?: number) => {
      if (connectionState === "connecting" || connectionState === "connected") {
        return;
      }

      setError(null);
      setConnectionState("connecting");
      transcript.clear();
      haptic.light();

      const webrtc = loadWebrtc();
      if (!webrtc) {
        // Native module unavailable — almost always Expo Go. The mic
        // button is already hidden there, so reaching this branch means
        // someone navigated to /copilot/voice directly via deep-link.
        setConnectionState("error");
        setError(
          "Voice copilot isn't available in Expo Go. Use a development or production build to test voice.",
        );
        haptic.error();
        return;
      }
      const { RTCPeerConnection, mediaDevices } = webrtc;

      try {
        // 1. Get ephemeral token from our backend
        const session = await api<VoiceSessionResponse>(
          "post",
          Endpoints.copilot.voiceSession,
          appointmentId ? { appointment_id: appointmentId } : undefined,
        );
        sessionIdRef.current = session.session_id;

        // 2. Create RTCPeerConnection
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        // 3. Play remote audio (AI voice)
        pc.addEventListener("track", (evt: { streams: MediaStreamType[] }) => {
          // react-native-webrtc auto-plays remote audio tracks
          if (evt.streams && evt.streams[0]) {
            // Remote stream attached — AI audio will play through speaker
          }
        });

        // 4. Get microphone stream and add to peer connection
        const localStream = await mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        for (const track of localStream.getTracks()) {
          pc.addTrack(track, localStream);
        }

        // 5. Set up data channel for events
        const dc = pc.createDataChannel("oai-events");
        dcRef.current = dc;

        dc.addEventListener("open", () => {
          // Configure session for input audio transcription
          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                input_audio_transcription: { model: "whisper-1" },
              },
            }),
          );
        });

        dc.addEventListener("message", handleDataChannelMessage);

        // 6. Create offer and set local description
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);

        // 7. Send offer to OpenAI Realtime API
        const sdpResponse = await fetch(
          `${OPENAI_REALTIME_URL}?model=gpt-4o-realtime-preview`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.client_secret}`,
              "Content-Type": "application/sdp",
            },
            body: offer.sdp,
          },
        );

        if (!sdpResponse.ok) {
          throw new Error(`Realtime API returned ${sdpResponse.status}`);
        }

        const answerSdp = await sdpResponse.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

        // 8. Session is live
        setConnectionState("connected");
        sessionStartRef.current = Date.now();
        haptic.success();

        // 9. Session duration timer + auto-close
        timerRef.current = setInterval(() => {
          const elapsed = Date.now() - sessionStartRef.current;
          setSessionDurationMs(elapsed);

          if (elapsed >= SESSION_WARN_MS && !warnedRef.current) {
            warnedRef.current = true;
            // The AI should have been instructed to warn — we also vibrate
            haptic.warning();
          }

          if (elapsed >= SESSION_MAX_MS) {
            disconnect();
          }
        }, 1000);

        // 10. Monitor ICE connection state
        pc.addEventListener("iceconnectionstatechange", () => {
          const state = pc.iceConnectionState;
          if (state === "disconnected" || state === "failed") {
            setConnectionState("error");
            setError("Connection lost");
            haptic.error();
            disconnect();
          }
        });
      } catch (err) {
        cleanup();
        setConnectionState("error");
        const msg =
          err instanceof Error ? err.message : "Failed to start voice session";
        setError(msg);
        haptic.error();
      }
    },
    [
      connectionState,
      transcript,
      handleDataChannelMessage,
      disconnect,
      cleanup,
    ],
  );

  // Close connection when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && connectionState === "connected") {
        disconnect();
      }
    });
    return () => sub.remove();
  }, [connectionState, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pcRef.current) {
        reportSessionEnd().then(cleanup);
      }
    };
  }, [reportSessionEnd, cleanup]);

  return {
    connectionState,
    isAiSpeaking,
    transcriptEntries: transcript.entries,
    sessionDurationMs,
    startSession,
    disconnect,
    error,
  };
}
