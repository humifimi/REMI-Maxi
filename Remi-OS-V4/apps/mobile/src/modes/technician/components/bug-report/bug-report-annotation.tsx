import { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { captureRef } from "react-native-view-shot";
import { BUG_REPORT_CONFIG } from "@technician/constants/bug-report";
import { haptic } from "@technician/hooks/utility/use-haptics";

const COLORS = BUG_REPORT_CONFIG.ANNOTATION.COLORS;
const STROKE_WIDTH = BUG_REPORT_CONFIG.ANNOTATION.DEFAULT_STROKE_WIDTH;

interface StrokePath {
  d: string;
  color: string;
}

interface AnnotationResult {
  plainUri: string;
  annotatedUri: string;
}

interface BugReportAnnotationProps {
  screenshotUri: string;
  onDone: (result: AnnotationResult) => void;
  onCancel: () => void;
}

export function BugReportAnnotation({
  screenshotUri,
  onDone,
  onCancel,
}: BugReportAnnotationProps) {
  const { width, height } = Dimensions.get("window");
  const [paths, setPaths] = useState<StrokePath[]>([]);
  const [currentColor, setCurrentColor] = useState<string>(COLORS[0]);
  const currentPath = useRef("");
  const compositeRef = useRef<View>(null);

  const drawGesture = Gesture.Pan()
    .onStart((e) => {
      currentPath.current = `M${e.x},${e.y}`;
    })
    .onUpdate((e) => {
      currentPath.current += ` L${e.x},${e.y}`;
      setPaths((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.d.startsWith(currentPath.current.split(" L")[0])) {
          updated[updated.length - 1] = {
            d: currentPath.current,
            color: currentColor,
          };
        } else {
          updated.push({ d: currentPath.current, color: currentColor });
        }
        return updated;
      });
    })
    .onEnd(() => {
      setPaths((prev) => {
        const existing = prev.filter(
          (p) => !p.d.startsWith(currentPath.current.split(" L")[0])
        );
        return [...existing, { d: currentPath.current, color: currentColor }];
      });
      currentPath.current = "";
    })
    .minDistance(0);

  const handleUndo = useCallback(() => {
    haptic.light();
    setPaths((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    haptic.light();
    setPaths([]);
  }, []);

  const handleDone = useCallback(async () => {
    haptic.medium();
    try {
      const annotatedUri = await captureRef(compositeRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      onDone({ plainUri: screenshotUri, annotatedUri });
    } catch {
      onDone({ plainUri: screenshotUri, annotatedUri: screenshotUri });
    }
  }, [screenshotUri, onDone]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <View ref={compositeRef} style={[styles.canvas, { width, height }]} collapsable={false}>
        <Image
          source={{ uri: screenshotUri }}
          style={[styles.screenshot, { width, height }]}
          resizeMode="cover"
        />
        <GestureDetector gesture={drawGesture}>
          <Svg style={[styles.svgOverlay, { width, height }]}>
            {paths.map((stroke, i) => (
              <Path
                key={i}
                d={stroke.d}
                stroke={stroke.color}
                strokeWidth={STROKE_WIDTH}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        </GestureDetector>
      </View>

      <View style={styles.toolbar}>
        <Pressable onPress={onCancel} style={styles.toolBtn}>
          <MaterialIcons name="close" size={22} color="#fff" />
        </Pressable>

        <View style={styles.colorPicker}>
          {COLORS.map((color) => (
            <Pressable
              key={color}
              onPress={() => {
                haptic.selection();
                setCurrentColor(color);
              }}
              style={[
                styles.colorSwatch,
                { backgroundColor: color },
                currentColor === color && styles.colorSwatchActive,
              ]}
            />
          ))}
        </View>

        <Pressable
          onPress={handleUndo}
          style={styles.toolBtn}
          disabled={paths.length === 0}
        >
          <MaterialIcons
            name="undo"
            size={22}
            color={paths.length === 0 ? "#6B7280" : "#fff"}
          />
        </Pressable>

        <Pressable
          onPress={handleClear}
          style={styles.toolBtn}
          disabled={paths.length === 0}
        >
          <MaterialIcons
            name="delete-outline"
            size={22}
            color={paths.length === 0 ? "#6B7280" : "#fff"}
          />
        </Pressable>

        <Pressable onPress={handleDone} style={styles.doneBtn}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    backgroundColor: "#000",
  },
  canvas: {
    flex: 1,
  },
  screenshot: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  svgOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  toolbar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 40,
    backgroundColor: "rgba(0,0,0,0.8)",
    gap: 12,
  },
  colorPicker: {
    flexDirection: "row",
    gap: 10,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorSwatchActive: {
    borderColor: "#fff",
    borderWidth: 3,
  },
  toolBtn: {
    padding: 8,
  },
  doneBtn: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  doneText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
