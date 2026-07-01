import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import BarcodeScanning, {
  BarcodeFormat,
} from "@react-native-ml-kit/barcode-scanning";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useScanVehicle } from "@technician/hooks/jobs/use-scan-vehicle";
import { Brand } from "@technician/constants/brand";
import { NativeCamera } from "@technician/constants/runtime";
import {
  extractBestVin,
  normalizeVinText,
  previewVinFromText,
  validateVinCheckDigit,
} from "@technician/utils/vin";

type ScanMode = "plate" | "vin";

interface VehicleScannerProps {
  visible: boolean;
  initialMode: ScanMode;
  onScan: (text: string, mode: ScanMode, detectedState?: string | null) => void;
  onClose: () => void;
}

const VIN_FALLBACK_TIMEOUT_MS = 30_000;
const VIN_BARCODE_TYPES = [
  "code39",
  "code128",
  "code93",
  "codabar",
  "pdf417",
  "datamatrix",
] as const;

function extractPlateText(fullText: string): string {
  const lines = fullText.split("\n").map((l) => l.trim()).filter(Boolean);
  let best = "";
  for (const line of lines) {
    const cleaned = line.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (cleaned.length >= 2 && cleaned.length <= 8 && cleaned.length > best.length) {
      best = cleaned;
    }
  }
  return best || lines[0]?.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "";
}

async function ensureImagePickerCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.getCameraPermissionsAsync();
  if (status === "granted") return true;
  const result = await ImagePicker.requestCameraPermissionsAsync();
  return result.status === "granted";
}

/**
 * Vehicle scanner.
 *
 *  - VIN mode: hybrid capture via expo-camera. The live preview-frame
 *    barcode scanner (`onBarcodeScanned`) is kept as a fast-path but only
 *    auto-accepts reads whose ISO-3779 check digit validates EXACTLY — that
 *    layer is too low-resolution to trust single-character repairs. On tap,
 *    we run ML Kit BARCODE-SCAN + TEXT-RECOGNITION in parallel on the
 *    full-resolution still photo; either one returning a valid VIN wins.
 *    Backend Tesseract OCR is the last fallback.
 *  - Plate mode: photo capture via ImagePicker → backend Plate Recognizer.
 */
export default function VehicleScanner({
  visible,
  initialMode,
  onScan,
  onClose,
}: VehicleScannerProps) {
  const scanVehicle = useScanVehicle();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [mode, setMode] = useState<ScanMode>(initialMode);
  const [processing, setProcessing] = useState(false);
  const [isPresentingCamera, setIsPresentingCamera] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [vinHelperVisible, setVinHelperVisible] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const activeRef = useRef(false);
  const vinScannedRef = useRef(false);
  const processingRef = useRef(false);
  const vinHelperTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    processingRef.current = processing;
  }, [processing]);

  const clearVinHelperTimeout = useCallback(() => {
    if (vinHelperTimeoutRef.current) {
      clearTimeout(vinHelperTimeoutRef.current);
      vinHelperTimeoutRef.current = null;
    }
  }, []);

  // Reset internal state every time the scanner becomes visible. `mode` is
  // re-derived from `initialMode` so re-opening a closed scanner respects the
  // current screen's intent (start-job's mode toggle, confirm-vehicle's "vin",
  // carfax-tools' chosen field).
  useEffect(() => {
    if (visible) {
      setMode(initialMode);
      setResultText(null);
      setProcessing(false);
      setIsPresentingCamera(false);
      setVinHelperVisible(false);
      setTorchOn(false);
      activeRef.current = false;
      vinScannedRef.current = false;
      clearVinHelperTimeout();
    }
    return () => {
      clearVinHelperTimeout();
    };
  }, [visible, initialMode, clearVinHelperTimeout]);

  // Request camera permission the first time the user enters VIN mode (or
  // re-enters after a previous denial). The camera-roll permission used by
  // ImagePicker is the same iOS permission, but Android treats them as a
  // single grant, and asking via the right module keeps Expo's prompt copy
  // consistent across both flows.
  useEffect(() => {
    if (!visible || mode !== "vin") return;
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
      requestCameraPermission().catch(() => {
        // Silent — we render a permission-denied state below if it stays denied.
      });
    }
  }, [visible, mode, cameraPermission, requestCameraPermission]);

  // VIN-mode helper-message timer. After VIN_FALLBACK_TIMEOUT_MS without a
  // valid scan we surface "Can't find barcode. Try the door jamb…" so the
  // tech isn't stuck staring at the viewfinder forever.
  useEffect(() => {
    if (!visible || mode !== "vin") {
      clearVinHelperTimeout();
      return;
    }
    if (!cameraPermission?.granted) {
      clearVinHelperTimeout();
      return;
    }
    if (vinScannedRef.current) return;

    clearVinHelperTimeout();
    vinHelperTimeoutRef.current = setTimeout(() => {
      if (!vinScannedRef.current) {
        setVinHelperVisible(true);
      }
    }, VIN_FALLBACK_TIMEOUT_MS);

    return () => {
      clearVinHelperTimeout();
    };
  }, [visible, mode, cameraPermission?.granted, clearVinHelperTimeout]);

  const showFailureAlert = useCallback(
    (rawText: string | null, reason: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const trimmedRaw = (rawText || "").trim();
      const preview =
        trimmedRaw.length > 0
          ? `\n\nWhat the camera saw: "${trimmedRaw.slice(0, 80)}${
              trimmedRaw.length > 80 ? "…" : ""
            }"`
          : "";
      Alert.alert(
        "Couldn't Read",
        `${reason}${preview}\n\nTry again with brighter light and a closer angle, or type it in by hand.`,
        [
          { text: "Try Again", style: "default" },
          {
            text: "Type Manually",
            style: "cancel",
            onPress: onClose,
          },
        ],
      );
    },
    [onClose],
  );

  // --- VIN mode: barcode scan + photo OCR ---

  const completeVinScan = useCallback(
    (vin: string, source: "barcode" | "mlkit" | "backend-ocr") => {
      console.log("[scan-vehicle] VIN accepted", { vin, source });
      vinScannedRef.current = true;
      clearVinHelperTimeout();
      setVinHelperVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResultText(vin);
      onScan(vin, "vin");
    },
    [clearVinHelperTimeout, onScan],
  );

  // Live preview-frame barcode scanner. AVFoundation on iOS / CameraX on
  // Android — it's the same path expo-camera ships by default. It's
  // notoriously unreliable on Code 39 VIN barcodes (low preview resolution,
  // long skinny bar pattern). To avoid auto-accepting a wrong read we ONLY
  // honor reads whose check digit validates exactly. The "almost valid +
  // single-char repair" path is reserved for the tap-to-capture flow below
  // (ML Kit on the full-res still) — see `handleVinPhotoCapture`.
  const handleBarcodeScanned = useCallback(
    (event: BarcodeScanningResult) => {
      if (vinScannedRef.current || processingRef.current) return;

      const normalized = normalizeVinText(event.data ?? "");
      const exact =
        normalized.length === 17 && validateVinCheckDigit(normalized)
          ? normalized
          : null;

      if (!exact) {
        console.log("[scan-vehicle] live barcode ignored (no exact match)", {
          type: event.type,
          raw: (event.data ?? "").slice(0, 48),
          normalized: normalized.slice(0, 24),
        });
        return;
      }

      console.log("[scan-vehicle] live barcode accepted", {
        type: event.type,
        vin: exact,
      });

      completeVinScan(exact, "barcode");
    },
    [completeVinScan],
  );

  // --- Plate mode: photo capture → backend OCR (Plate Recognizer) ---

  const processPhoto = useCallback(
    async (uri: string) => {
      try {
        const result = await scanVehicle.mutateAsync({
          imageUri: uri,
          type: mode,
        });

        // Always log the raw OCR result to Metro so failed scans can be
        // diagnosed in the field instead of silently disappearing. With the
        // Plate Recognizer migration this now logs the upstream confidence +
        // detected_state for plate scans, which makes field tuning easier.
        console.log("[scan-vehicle] OCR result", {
          mode,
          text: result.text,
          confidence: result.confidence,
          raw_candidates: result.raw_candidates,
          detected_state: result.detected_state,
        });

        if (result.text) {
          if (mode === "vin") {
            const vin =
              extractBestVin(result.text) ??
              (result.raw_candidates ?? [])
                .map((candidate) => extractBestVin(candidate))
                .find((value): value is string => value != null) ??
              null;

            if (vin) {
              completeVinScan(vin, "backend-ocr");
              return true;
            }

            const preview =
              previewVinFromText(result.text) ??
              result.raw_candidates
                ?.map((candidate) => previewVinFromText(candidate))
                .find((value): value is string => value != null);

            console.log("[scan-vehicle] backend VIN OCR rejected", {
              text: result.text,
              preview,
              raw_candidates: result.raw_candidates,
            });

            showFailureAlert(
              result.text,
              preview
                ? "Read some characters but couldn't verify a valid VIN check digit."
                : "Got some text but it doesn't look like a complete VIN.",
            );
            return false;
          }

          const cleanedText = extractPlateText(result.text);
          const isValidText = cleanedText.length >= 2;
          if (!isValidText) {
            showFailureAlert(
              result.text,
              "Got some text but it doesn't look like a license plate.",
            );
            return false;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setResultText(cleanedText);
          onScan(cleanedText, mode, result.detected_state);
          return true;
        }

        showFailureAlert(
          null,
          mode === "plate"
            ? "Couldn't find a plate in this photo."
            : "No readable text was detected in the photo.",
        );
        return false;
      } catch (err) {
        console.warn("[scan-vehicle] OCR request failed", err);
        showFailureAlert(
          null,
          "Couldn't process the photo. Check your connection and try again.",
        );
        return false;
      }
    },
    [mode, onScan, scanVehicle, showFailureAlert, completeVinScan],
  );

  const handleVinPhotoCapture = useCallback(async () => {
    if (!cameraRef.current || processing || vinScannedRef.current) return;
    setProcessing(true);

    try {
      // Take the full-res still. The live `onBarcodeScanned` runs on the
      // preview frames (downsampled) and is notoriously bad on long, skinny
      // Code 39 VIN barcodes. ML Kit on the still photo is significantly
      // better — that's why we run it explicitly here on tap.
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1.0,
        shutterSound: true,
      });
      if (!photo?.uri) return;

      if (Platform.OS !== "web") {
        // Race ML Kit barcode-scan against ML Kit text-recognition on the
        // same still. Either one returning a valid VIN wins. Barcode wins
        // on the door-jamb / under-hood label; OCR wins on the windshield
        // dash plate where the barcode is often too small to resolve.
        const [barcodeOutcome, ocrOutcome] = await Promise.allSettled([
          BarcodeScanning.scan(photo.uri),
          TextRecognition.recognize(photo.uri),
        ]);

        if (barcodeOutcome.status === "fulfilled") {
          const barcodes = barcodeOutcome.value;
          console.log("[scan-vehicle] ML Kit barcode scan", {
            count: barcodes.length,
            barcodes: barcodes.slice(0, 4).map((b) => ({
              format: BarcodeFormat[b.format] ?? b.format,
              valuePreview: b.value.slice(0, 24),
            })),
          });
          for (const b of barcodes) {
            const vin = extractBestVin(b.value);
            if (vin) {
              completeVinScan(vin, "mlkit-barcode");
              return;
            }
          }
        } else {
          console.warn("[scan-vehicle] ML Kit barcode unavailable", {
            err:
              barcodeOutcome.reason instanceof Error
                ? barcodeOutcome.reason.message
                : String(barcodeOutcome.reason),
          });
        }

        if (ocrOutcome.status === "fulfilled") {
          const fullText = ocrOutcome.value.text;
          console.log("[scan-vehicle] ML Kit VIN OCR", {
            length: fullText?.length ?? 0,
            preview: (fullText ?? "").slice(0, 120),
          });

          if (fullText?.trim()) {
            const vin = extractBestVin(fullText);
            if (vin) {
              completeVinScan(vin, "mlkit");
              return;
            }
            console.log("[scan-vehicle] ML Kit VIN OCR needs backend fallback", {
              preview: previewVinFromText(fullText),
              fullTextPreview: fullText.slice(0, 120),
            });
          }
        } else {
          console.warn("[scan-vehicle] ML Kit OCR unavailable", {
            err:
              ocrOutcome.reason instanceof Error
                ? ocrOutcome.reason.message
                : String(ocrOutcome.reason),
          });
        }
      }

      await processPhoto(photo.uri);
    } catch (captureErr) {
      console.warn("[scan-vehicle] VIN photo capture failed", captureErr);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setProcessing(false);
    }
  }, [completeVinScan, processPhoto, processing]);

  const handlePhotoScan = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    setProcessing(true);

    try {
      const hasPermission = await ensureImagePickerCameraPermission();
      if (!hasPermission) {
        Alert.alert("Camera Required", `Please grant camera access in Settings to use ${Brand.name}.`);
        setProcessing(false);
        activeRef.current = false;
        return;
      }

      // Hide the scanner overlay before presenting native camera UI to avoid
      // iOS presentation conflicts (overlay + UIImagePickerController).
      setIsPresentingCamera(true);
      NativeCamera.acquire();
      await new Promise((resolve) => setTimeout(resolve, 250));

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        setProcessing(false);
        activeRef.current = false;
        return;
      }

      await processPhoto(result.assets[0].uri);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      NativeCamera.release();
      setIsPresentingCamera(false);
      setProcessing(false);
      activeRef.current = false;
    }
  }, [processPhoto]);

  if (!visible || isPresentingCamera) return null;

  const renderModeToggle = () => (
    <View style={styles.modeRow}>
      <Pressable
        style={[styles.modeBtn, mode === "plate" && styles.modeBtnActive]}
        onPress={() => {
          setMode("plate");
          setResultText(null);
          setVinHelperVisible(false);
          vinScannedRef.current = false;
          clearVinHelperTimeout();
        }}
      >
        <MaterialIcons
          name="directions-car"
          size={20}
          color={mode === "plate" ? "#fff" : "#9CA3AF"}
        />
        <Text
          style={[styles.modeText, mode === "plate" && styles.modeTextActive]}
        >
          License Plate
        </Text>
      </Pressable>
      <Pressable
        style={[styles.modeBtn, mode === "vin" && styles.modeBtnActive]}
        onPress={() => {
          setMode("vin");
          setResultText(null);
          setVinHelperVisible(false);
          vinScannedRef.current = false;
        }}
      >
        <MaterialIcons
          name="qr-code-scanner"
          size={20}
          color={mode === "vin" ? "#fff" : "#9CA3AF"}
        />
        <Text style={[styles.modeText, mode === "vin" && styles.modeTextActive]}>
          VIN
        </Text>
      </Pressable>
    </View>
  );

  // --- VIN mode renders the live camera scanner ---
  if (mode === "vin") {
    const permissionGranted = cameraPermission?.granted === true;
    const permissionPermanentlyDenied =
      cameraPermission?.granted === false && cameraPermission.canAskAgain === false;

    return (
      <View style={styles.overlay}>
        {/* Live camera takes the full overlay; controls float on top. */}
        {permissionGranted ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFillObject}
            facing="back"
            enableTorch={torchOn}
            barcodeScannerSettings={{
              barcodeTypes: [...VIN_BARCODE_TYPES],
            }}
            onBarcodeScanned={handleBarcodeScanned}
          />
        ) : (
          <View style={styles.permissionFallback}>
            <MaterialIcons name="no-photography" size={56} color="#9CA3AF" />
            <Text style={styles.permissionTitle}>Camera Access Required</Text>
            <Text style={styles.permissionBody}>
              {permissionPermanentlyDenied
                ? `Open Settings and grant camera access to ${Brand.name} to scan VIN barcodes.`
                : "We need camera access to scan VIN barcodes."}
            </Text>
            {!permissionPermanentlyDenied && (
              <Pressable
                style={styles.permissionBtn}
                onPress={() => {
                  requestCameraPermission().catch(() => undefined);
                }}
              >
                <Text style={styles.permissionBtnText}>Allow Camera</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Dim scrim around the viewfinder so the tech knows where to aim. */}
        {permissionGranted && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <View style={styles.scrimTop} />
            <View style={styles.scrimMiddleRow}>
              <View style={styles.scrimSide} />
              <View style={styles.viewfinder} />
              <View style={styles.scrimSide} />
            </View>
            <View style={styles.scrimBottom} />
          </View>
        )}

        {/* Close + torch */}
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={16}>
          <MaterialIcons name="close" size={28} color="#fff" />
        </Pressable>
        {permissionGranted ? (
          <Pressable
            style={styles.torchBtn}
            onPress={() => setTorchOn((t) => !t)}
            hitSlop={16}
          >
            <MaterialIcons
              name={torchOn ? "flash-on" : "flash-off"}
              size={26}
              color={torchOn ? "#FBBF24" : "#fff"}
            />
          </Pressable>
        ) : null}

        {/* Mode toggle pinned at the top so the tech can switch back to plate. */}
        <View style={styles.modeToggleContainer} pointerEvents="box-none">
          {renderModeToggle()}
        </View>

        {/* Bottom instructions / helper / result / shutter */}
        <View style={styles.bottomPanel}>
          {resultText ? (
            <View style={styles.resultCard}>
              <MaterialIcons name="check-circle" size={28} color="#22C55E" />
              <Text style={styles.resultText}>{resultText}</Text>
            </View>
          ) : vinHelperVisible ? (
            <View style={styles.helperCard}>
              <MaterialIcons name="info-outline" size={22} color="#FBBF24" />
              <View style={{ flex: 1 }}>
                <Text style={styles.helperTitle}>No barcode detected</Text>
                <Text style={styles.helperBody}>
                  Tap the shutter to scan the barcode at full resolution — works on the windshield VIN plate or under-hood label. Or type it manually.
                </Text>
              </View>
              <Pressable style={styles.helperBtn} onPress={onClose}>
                <Text style={styles.helperBtnText}>Type Manually</Text>
              </Pressable>
            </View>
          ) : permissionGranted ? (
            <View style={styles.instructionCard}>
              <MaterialIcons name="qr-code-scanner" size={22} color="#3B82F6" />
              <Text style={styles.instructionText}>
                Tap shutter for accurate barcode / text scan • live auto-scan active
              </Text>
            </View>
          ) : null}

          {permissionGranted && !resultText ? (
            <View style={styles.vinCaptureRow}>
              {processing ? (
                <View style={styles.shutterOuter}>
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              ) : (
                <Pressable
                  style={styles.shutterOuter}
                  onPress={handleVinPhotoCapture}
                  disabled={vinScannedRef.current}
                >
                  <View style={styles.shutterInner} />
                </Pressable>
              )}
              <Text style={styles.captureHint}>
                Tap shutter for best accuracy — barcode + text scanned together
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  // --- Plate mode renders the existing photo-capture flow ---
  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={16}>
          <MaterialIcons name="close" size={28} color="#9CA3AF" />
        </Pressable>

        {renderModeToggle()}

        <View style={styles.heroSection}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="photo-camera" size={56} color="#3B82F6" />
          </View>
          <Text style={styles.heroTitle}>Capture License Plate</Text>
          <Text style={styles.heroSubtitle}>
            Take a clear photo of the license plate — accuracy is highest with
            good light and the plate squared up in the frame.
          </Text>
        </View>

        {resultText && (
          <View style={styles.resultCard}>
            <MaterialIcons name="check-circle" size={28} color="#22C55E" />
            <Text style={styles.resultText}>{resultText}</Text>
          </View>
        )}

        <View style={styles.actionSection}>
          <Pressable
            style={[styles.scanBtn, (processing || !!resultText) && styles.scanBtnDisabled]}
            onPress={handlePhotoScan}
            disabled={processing || !!resultText}
          >
            {processing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name="camera-alt" size={24} color="#fff" />
                <Text style={styles.scanBtnText}>Take Photo</Text>
              </>
            )}
          </Pressable>

          <Text style={styles.hint}>
            Photo will be sent to the plate-recognition service
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: "#111827",
  },
  container: {
    flex: 1,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  closeBtn: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  torchBtn: {
    position: "absolute",
    top: 60,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 32,
  },
  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  modeBtnActive: {
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  },
  modeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  modeTextActive: {
    color: "#fff",
  },
  modeToggleContainer: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  heroSection: {
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(59,130,246,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
  },
  heroSubtitle: {
    fontSize: 15,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 22,
  },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(34,197,94,0.18)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.4)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  resultText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1.5,
  },
  actionSection: {
    alignItems: "center",
    gap: 12,
    width: "100%",
    marginTop: 8,
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 14,
    width: "100%",
  },
  scanBtnDisabled: {
    opacity: 0.6,
  },
  scanBtnText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  hint: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  vinCaptureRow: {
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
  },
  captureHint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    fontWeight: "500",
    paddingHorizontal: 12,
  },
  // VIN-mode camera viewfinder.
  // We dim the area outside a centered rectangle so the tech's eye snaps to
  // the aim zone. The viewfinder rectangle itself is transparent — touches
  // pass through to the camera (which is non-interactive anyway).
  scrimTop: {
    height: "30%",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  scrimBottom: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  scrimMiddleRow: {
    flexDirection: "row",
    height: 160,
  },
  scrimSide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  viewfinder: {
    width: "78%",
    borderWidth: 2,
    borderColor: "#3B82F6",
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  bottomPanel: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 32,
    gap: 12,
  },
  instructionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  instructionText: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  helperCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.6)",
  },
  helperTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  helperBody: {
    color: "#D1D5DB",
    fontSize: 13,
    lineHeight: 18,
  },
  helperBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  helperBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  permissionFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  permissionTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  permissionBody: {
    color: "#9CA3AF",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  permissionBtn: {
    marginTop: 8,
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  permissionBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
