import { useCallback, useRef, useState } from "react";
import { Audio } from "expo-av";
import { BUG_REPORT_CONFIG } from "@technician/constants/bug-report";
import { haptic } from "@technician/hooks/utility/use-haptics";

const VOICE_CFG = BUG_REPORT_CONFIG.VOICE_MEMO;

export type RecordingState = "idle" | "recording" | "recorded";

interface VoiceRecorderResult {
  state: RecordingState;
  durationMs: number;
  metering: number;
  uri: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  playback: () => Promise<void>;
  stopPlayback: () => Promise<void>;
  deleteRecording: () => void;
  loadUri: (externalUri: string) => void;
  isPlaying: boolean;
}

export function useVoiceRecorder(): VoiceRecorderResult {
  const [state, setState] = useState<RecordingState>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [metering, setMetering] = useState(-160);
  const [uri, setUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const startRecording = useCallback(async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        android: {
          extension: ".m4a",
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: VOICE_CFG.SAMPLE_RATE,
          numberOfChannels: VOICE_CFG.CHANNELS,
          bitRate: VOICE_CFG.BIT_RATE,
        },
        ios: {
          extension: ".m4a",
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: VOICE_CFG.SAMPLE_RATE,
          numberOfChannels: VOICE_CFG.CHANNELS,
          bitRate: VOICE_CFG.BIT_RATE,
        },
        web: {},
        isMeteringEnabled: true,
      });

      await recording.startAsync();
      recordingRef.current = recording;
      startTimeRef.current = Date.now();
      setState("recording");
      setDurationMs(0);

      timerRef.current = setInterval(async () => {
        const elapsed = Date.now() - startTimeRef.current;
        setDurationMs(elapsed);

        try {
          const status = await recording.getStatusAsync();
          if (status.isRecording && status.metering != null) {
            setMetering(status.metering);
          }
        } catch { /* metering failure is non-critical */ }

        if (elapsed >= VOICE_CFG.MAX_DURATION_MS) {
          haptic.warning();
          await stopRecordingInternal(recording);
        }
      }, 100);
    } catch {
      setState("idle");
    }
  }, []);

  const stopRecordingInternal = async (recording: Audio.Recording) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    try {
      await recording.stopAndUnloadAsync();
      const recordingUri = recording.getURI();
      recordingRef.current = null;
      setUri(recordingUri);
      setState("recorded");
      setDurationMs(Date.now() - startTimeRef.current);
      setMetering(-160);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    } catch {
      setState("idle");
    }
  };

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    haptic.light();
    await stopRecordingInternal(recordingRef.current);
  }, []);

  const playback = useCallback(async () => {
    if (!uri) return;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setIsPlaying(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });
    } catch {
      setIsPlaying(false);
    }
  }, [uri]);

  const stopPlayback = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      setIsPlaying(false);
    }
  }, []);

  const deleteRecording = useCallback(() => {
    haptic.light();
    if (soundRef.current) {
      soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setUri(null);
    setDurationMs(0);
    setState("idle");
  }, []);

  const loadUri = useCallback((externalUri: string, duration?: number) => {
    setUri(externalUri);
    setState("recorded");
    setDurationMs(duration ?? 0);
  }, []);

  return {
    state,
    durationMs,
    metering,
    uri,
    startRecording,
    stopRecording,
    playback,
    stopPlayback,
    deleteRecording,
    loadUri,
    isPlaying,
  };
}
