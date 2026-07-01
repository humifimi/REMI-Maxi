import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useVoiceRecorder } from "@technician/hooks/utility/use-voice-recorder";
import { haptic } from "@technician/hooks/utility/use-haptics";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function getMeteringHeight(metering: number): number {
  const clamped = Math.max(-60, Math.min(0, metering));
  return ((clamped + 60) / 60) * 24 + 4;
}

interface BugReportVoiceProps {
  onRecordingComplete: (uri: string, durationMs: number) => void;
  onDelete: () => void;
  existingUri?: string | null;
  existingDurationMs?: number;
}

export function BugReportVoice({
  onRecordingComplete,
  onDelete,
  existingUri,
  existingDurationMs,
}: BugReportVoiceProps) {
  const recorder = useVoiceRecorder();
  const prevRecorderUri = useRef(recorder.uri);

  useEffect(() => {
    if (existingUri && recorder.state === "idle") {
      recorder.loadUri(existingUri, existingDurationMs);
    }
  }, [existingUri, existingDurationMs, recorder.state, recorder.loadUri]);

  useEffect(() => {
    if (
      recorder.state === "recorded" &&
      recorder.uri &&
      recorder.uri !== prevRecorderUri.current
    ) {
      onRecordingComplete(recorder.uri, recorder.durationMs);
    }
    prevRecorderUri.current = recorder.uri;
  }, [recorder.state, recorder.uri, recorder.durationMs, onRecordingComplete]);

  if (recorder.state === "recording") {
    return (
      <View style={styles.container}>
        <View style={styles.recordingRow}>
          <View style={styles.waveform}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: getMeteringHeight(
                      recorder.metering + (Math.random() * 6 - 3)
                    ),
                    backgroundColor: "#EF4444",
                  },
                ]}
              />
            ))}
          </View>
          <Text style={styles.timer}>{formatDuration(recorder.durationMs)}</Text>
          <Pressable
            onPress={() => recorder.stopRecording()}
            style={styles.stopBtn}
          >
            <View style={styles.stopIcon} />
          </Pressable>
        </View>
      </View>
    );
  }

  if (recorder.state === "recorded") {
    return (
      <View style={styles.container}>
        <View style={styles.recordedRow}>
          <Pressable
            onPress={() => {
              haptic.light();
              if (recorder.isPlaying) {
                recorder.stopPlayback();
              } else {
                recorder.playback();
              }
            }}
            style={styles.playBtn}
          >
            <MaterialIcons
              name={recorder.isPlaying ? "pause" : "play-arrow"}
              size={20}
              color="#3B82F6"
            />
          </Pressable>
          <Text style={styles.recordedLabel}>
            Voice memo {formatDuration(recorder.durationMs)}
          </Text>
          <Pressable
            onPress={() => {
              recorder.deleteRecording();
              onDelete();
            }}
            style={styles.deleteBtn}
          >
            <MaterialIcons name="delete-outline" size={20} color="#EF4444" />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => {
          haptic.medium();
          recorder.startRecording();
        }}
        style={styles.micBtn}
      >
        <MaterialIcons name="mic" size={22} color="#6B7280" />
        <Text style={styles.micLabel}>Add voice memo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  micBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
  },
  micLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  recordingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
  },
  waveform: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flex: 1,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    minHeight: 4,
  },
  timer: {
    fontSize: 14,
    fontWeight: "600",
    color: "#EF4444",
    fontVariant: ["tabular-nums"],
  },
  stopBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  stopIcon: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: "#fff",
  },
  recordedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  recordedLabel: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
  },
  deleteBtn: {
    padding: 4,
  },
});
