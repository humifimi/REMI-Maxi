import { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Modal,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Svg, { Path } from "react-native-svg";
import * as ImageManipulator from "expo-image-manipulator";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CIRCLE_SIZE = SCREEN_W * 0.82;
const CIRCLE_RADIUS = CIRCLE_SIZE / 2;
const OUTPUT_SIZE = 512;

const HEADER_HEIGHT = 100;
const FOOTER_HEIGHT = 80;
const EDITOR_HEIGHT = SCREEN_H - HEADER_HEIGHT - FOOTER_HEIGHT;
const CIRCLE_CX = SCREEN_W / 2;
const CIRCLE_CY = EDITOR_HEIGHT / 2;

interface AvatarEditorProps {
  visible: boolean;
  imageUri: string;
  onSave: (croppedUri: string) => void;
  onCancel: () => void;
}

function buildMaskPath(w: number, h: number, cx: number, cy: number, r: number): string {
  return [
    `M0,0 L${w},0 L${w},${h} L0,${h} Z`,
    `M${cx - r},${cy}`,
    `a${r},${r} 0 1,0 ${2 * r},0`,
    `a${r},${r} 0 1,0 -${2 * r},0 Z`,
  ].join(" ");
}

export function AvatarEditor({ visible, imageUri, onSave, onCancel }: AvatarEditorProps) {
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    if (!imageUri) return;
    Image.prefetch(imageUri);
    (async () => {
      try {
        const info = await (Image as any).getSize?.(imageUri);
        if (info) {
          setImageSize({ w: info.width, h: info.height });
          return;
        }
      } catch { /* fallback below */ }

      const { Image: RNImage } = require("react-native");
      RNImage.getSize(
        imageUri,
        (w: number, h: number) => setImageSize({ w, h }),
        () => setImageSize({ w: CIRCLE_SIZE, h: CIRCLE_SIZE }),
      );
    })();
  }, [imageUri]);

  useEffect(() => {
    if (visible) {
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedScale.value = 1;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  }, [visible, scale, translateX, translateY, savedScale, savedTranslateX, savedTranslateY]);

  const baseFitScale =
    imageSize
      ? Math.max(CIRCLE_SIZE / imageSize.w, CIRCLE_SIZE / imageSize.h)
      : 1;

  const displayW = imageSize ? imageSize.w * baseFitScale : CIRCLE_SIZE;
  const displayH = imageSize ? imageSize.h * baseFitScale : CIRCLE_SIZE;

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(0.5, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1, { damping: 15 });
        savedScale.value = 1;
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handleSave = useCallback(async () => {
    if (!imageSize || saving) return;
    setSaving(true);

    try {
      const currentScale = savedScale.value * baseFitScale;
      const currentTX = savedTranslateX.value;
      const currentTY = savedTranslateY.value;

      const imgDisplayLeft = (SCREEN_W - displayW * savedScale.value) / 2 + currentTX;
      const imgDisplayTop = (EDITOR_HEIGHT - displayH * savedScale.value) / 2 + currentTY;

      const circleScreenLeft = (SCREEN_W - CIRCLE_SIZE) / 2;
      const circleScreenTop = (EDITOR_HEIGHT - CIRCLE_SIZE) / 2;

      const totalScale = currentScale * savedScale.value;
      const originX = (circleScreenLeft - imgDisplayLeft) / (baseFitScale * savedScale.value);
      const originY = (circleScreenTop - imgDisplayTop) / (baseFitScale * savedScale.value);
      const cropSize = CIRCLE_SIZE / (baseFitScale * savedScale.value);

      const clampedX = Math.max(0, Math.min(originX, imageSize.w - cropSize));
      const clampedY = Math.max(0, Math.min(originY, imageSize.h - cropSize));
      const clampedSize = Math.min(cropSize, imageSize.w - clampedX, imageSize.h - clampedY);

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: clampedX,
              originY: clampedY,
              width: clampedSize,
              height: clampedSize,
            },
          },
          { resize: { width: OUTPUT_SIZE, height: OUTPUT_SIZE } },
        ],
        { format: ImageManipulator.SaveFormat.PNG, compress: 0.9 },
      );

      onSave(result.uri);
    } catch (err) {
      console.error("[AvatarEditor] crop failed:", err);
    } finally {
      setSaving(false);
    }
  }, [imageSize, imageUri, baseFitScale, displayW, displayH, saving, onSave, savedScale, savedTranslateX, savedTranslateY]);

  const triggerSave = useCallback(() => {
    handleSave();
  }, [handleSave]);

  const maskPath = buildMaskPath(SCREEN_W, EDITOR_HEIGHT, CIRCLE_CX, CIRCLE_CY, CIRCLE_RADIUS);

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.headerBtn} hitSlop={12}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Edit Photo</Text>
          <Pressable
            onPress={triggerSave}
            style={[styles.headerBtn, saving && styles.headerBtnDisabled]}
            hitSlop={12}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.editorArea}>
          <GestureDetector gesture={composed}>
            <Animated.View
              style={[
                {
                  width: displayW,
                  height: displayH,
                  position: "absolute",
                  left: (SCREEN_W - displayW) / 2,
                  top: (EDITOR_HEIGHT - displayH) / 2,
                },
                animatedStyle,
              ]}
            >
              <Image
                source={{ uri: imageUri }}
                style={{ width: "100%", height: "100%" }}
                contentFit="fill"
              />
            </Animated.View>
          </GestureDetector>

          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={SCREEN_W} height={EDITOR_HEIGHT}>
              <Path d={maskPath} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />
            </Svg>
          </View>

          <View
            style={[
              styles.circleRing,
              {
                left: CIRCLE_CX - CIRCLE_RADIUS - 2,
                top: CIRCLE_CY - CIRCLE_RADIUS - 2,
              },
            ]}
            pointerEvents="none"
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.hint}>Pinch to zoom &bull; Drag to reposition</Text>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerBtn: {
    minWidth: 60,
    alignItems: "center",
  },
  headerBtnDisabled: { opacity: 0.5 },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
  cancelText: {
    fontSize: 17,
    color: "#fff",
  },
  saveText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#3B82F6",
  },
  editorArea: {
    width: SCREEN_W,
    height: EDITOR_HEIGHT,
    overflow: "hidden",
  },
  circleRing: {
    position: "absolute",
    width: CIRCLE_SIZE + 4,
    height: CIRCLE_SIZE + 4,
    borderRadius: (CIRCLE_SIZE + 4) / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  footer: {
    height: FOOTER_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
  },
});
