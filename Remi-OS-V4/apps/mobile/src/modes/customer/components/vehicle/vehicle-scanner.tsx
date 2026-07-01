import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { useScanVehicle } from '@customer/hooks/vehicles/use-scan-vehicle';
import { Theme } from '@customer/constants/colors';
import { Brand } from '@customer/constants/brand';

type ScanMode = 'plate' | 'vin';

// VIN scanning (barcode + OCR) is fully implemented but disabled for customers.
// Customers add vehicles by plate during onboarding; VIN scanning is a technician
// workflow. Set showVinMode={true} to re-enable the Plate/VIN toggle if needed.
interface VehicleScannerProps {
  visible: boolean;
  initialMode?: ScanMode;
  showVinMode?: boolean;
  onScan: (text: string, mode: ScanMode, detectedState?: string | null) => void;
  onClose: () => void;
}

const VIN_BARCODE_TYPES = ['code39', 'code128', 'code93', 'pdf417', 'datamatrix'] as const;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const VIEWFINDER_W = SCREEN_W * 0.85;
const VIEWFINDER_H = 100;
const VIEWFINDER_TOP = SCREEN_H * 0.38;

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

function normalizeVin(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/Q/g, '9')
    .replace(/[^A-HJ-NPR-Z0-9]/g, '');
}

function extractPlateText(fullText: string): string {
  const lines = fullText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  let best = '';
  for (const line of lines) {
    const cleaned = line.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (cleaned.length >= 2 && cleaned.length <= 8 && cleaned.length > best.length) {
      best = cleaned;
    }
  }
  return best || lines[0]?.replace(/[^A-Z0-9]/gi, '').toUpperCase() || '';
}

function extractVinFromText(fullText: string): string | null {
  const cleaned = fullText.replace(/\s+/g, '').toUpperCase();
  const vinChars = normalizeVin(cleaned);
  if (vinChars.length >= 17) {
    for (let i = 0; i <= vinChars.length - 17; i++) {
      const candidate = vinChars.substring(i, i + 17);
      if (VIN_REGEX.test(candidate)) return candidate;
    }
  }
  return vinChars.length >= 14 ? vinChars.substring(0, 17) : null;
}

export default function VehicleScanner({
  visible,
  initialMode = 'plate',
  showVinMode = false,
  onScan,
  onClose,
}: VehicleScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  // expo-camera SDK 54: <CameraView /> is a React class component whose
  // instance methods are takePictureAsync / recordAsync / etc. The hidden
  // CameraViewRef type from expo-camera describes the *native* ref shim
  // (which has takePicture, not takePictureAsync) and is not what
  // <CameraView ref={...}> resolves to at runtime — using it here is what
  // caused `cameraRef.current.takePicture is not a function`.
  const cameraRef = useRef<CameraView | null>(null);
  const scanVehicle = useScanVehicle();

  const effectiveInitialMode: ScanMode = showVinMode ? initialMode : 'plate';
  const [mode, setMode] = useState<ScanMode>(effectiveInitialMode);
  const [torch, setTorch] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const hasScannedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setMode(effectiveInitialMode);
      setResultText(null);
      setProcessing(false);
      setTorch(false);
      hasScannedRef.current = false;
    }
  }, [visible, effectiveInitialMode]);

  const handleBarcodeScan = useCallback(
    (result: BarcodeScanningResult) => {
      if (hasScannedRef.current || processing || mode !== 'vin') return;

      const normalized = normalizeVin(result.data);
      if (normalized.length < 14) return;

      const vin = normalized.substring(0, 17);
      hasScannedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResultText(vin);

      setTimeout(() => onScan(vin, 'vin'), 600);
    },
    [mode, processing, onScan],
  );

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || processing || hasScannedRef.current) return;
    setProcessing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, shutterSound: true });
      if (!photo?.uri) {
        setProcessing(false);
        return;
      }

      if (Platform.OS !== 'web') {
        try {
          const ocrResult = await TextRecognition.recognize(photo.uri);
          const fullText = ocrResult.text;
          console.log('[customer-scanner] ML Kit OCR result', {
            mode,
            length: fullText?.length ?? 0,
            preview: (fullText ?? '').slice(0, 120),
          });

          if (fullText && fullText.trim().length > 0) {
            if (mode === 'vin') {
              const vin = extractVinFromText(fullText);
              if (vin && vin.length >= 14) {
                hasScannedRef.current = true;
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setResultText(vin);
                setProcessing(false);
                setTimeout(() => onScan(vin, 'vin'), 600);
                return;
              }
            } else {
              const plate = extractPlateText(fullText);
              if (plate.length >= 2) {
                hasScannedRef.current = true;
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setResultText(plate);
                setProcessing(false);
                setTimeout(() => onScan(plate, 'plate'), 600);
                return;
              }
            }
          }
        } catch (mlkitErr) {
          // ML Kit unavailable (e.g. Expo Go) — fall through to backend.
          console.warn('[customer-scanner] ML Kit unavailable, falling back to backend', {
            mode,
            err: mlkitErr instanceof Error ? mlkitErr.message : String(mlkitErr),
          });
        }
      }

      try {
        const result = await scanVehicle.mutateAsync({ imageUri: photo.uri, type: mode });
        if (result.text) {
          hasScannedRef.current = true;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setResultText(result.text);
          setTimeout(() => onScan(result.text, mode, result.detected_state), 600);
        } else {
          console.warn('[customer-scanner] backend returned empty result', { mode });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      } catch (backendErr) {
        // Backend scan error already logged by useScanVehicle; just haptic.
        console.warn('[customer-scanner] backend scan failed', {
          mode,
          err: backendErr instanceof Error ? backendErr.message : String(backendErr),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (captureErr) {
      console.warn('[customer-scanner] capture failed', {
        mode,
        err: captureErr instanceof Error ? captureErr.message : String(captureErr),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setProcessing(false);
    }
  }, [mode, processing, onScan, scanVehicle]);

  if (!visible) return null;

  if (!permission) {
    return (
      <Modal visible animationType="slide" statusBarTranslucent>
        <View style={styles.permissionContainer}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible animationType="slide" statusBarTranslucent>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color="#6B7280" />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            {Brand.permissions.camera}
          </Text>
          <Pressable style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Grant Access</Text>
          </Pressable>
          <Pressable style={styles.permissionCancelBtn} onPress={onClose}>
            <Text style={styles.permissionCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" statusBarTranslucent>
      <View style={styles.container}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{
            barcodeTypes: showVinMode && mode === 'vin' ? [...VIN_BARCODE_TYPES] : [],
          }}
          onBarcodeScanned={showVinMode && mode === 'vin' ? handleBarcodeScan : undefined}
        />

        {/* Dark overlay with viewfinder cutout */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.overlayTop} />
          <View style={styles.overlayMiddleRow}>
            <View style={styles.overlaySide} />
            <View style={styles.viewfinder}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              {mode === 'vin' && !resultText && <View style={styles.scanLine} />}
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom} />
        </View>

        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable style={styles.iconBtn} onPress={onClose} hitSlop={16}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>

          {showVinMode ? (
            <View style={styles.modeToggle}>
              <Pressable
                style={[styles.modeBtn, mode === 'plate' && styles.modeBtnActive]}
                onPress={() => {
                  setMode('plate');
                  hasScannedRef.current = false;
                  setResultText(null);
                }}
              >
                <Text style={[styles.modeText, mode === 'plate' && styles.modeTextActive]}>
                  Plate
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, mode === 'vin' && styles.modeBtnActive]}
                onPress={() => {
                  setMode('vin');
                  hasScannedRef.current = false;
                  setResultText(null);
                }}
              >
                <Text style={[styles.modeText, mode === 'vin' && styles.modeTextActive]}>
                  VIN
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.modeLabel}>License Plate</Text>
          )}

          <Pressable style={styles.iconBtn} onPress={() => setTorch((t) => !t)} hitSlop={16}>
            <Ionicons
              name={torch ? 'flash' : 'flash-off'}
              size={28}
              color={torch ? '#FBBF24' : '#fff'}
            />
          </Pressable>
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Text style={styles.instructionText}>
            {mode === 'vin' && showVinMode
              ? 'Point at the VIN barcode on the door jamb or windshield'
              : 'Point at the license plate and tap the shutter'}
          </Text>
        </View>

        {/* Result overlay */}
        {resultText && (
          <View style={styles.resultOverlay}>
            <Ionicons name="checkmark-circle" size={40} color={Theme.colors.success} />
            <Text style={styles.resultText}>{resultText}</Text>
          </View>
        )}

        {/* Bottom controls */}
        <View style={styles.bottomBar}>
          {processing ? (
            <View style={styles.shutterOuter}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : (
            <Pressable
              style={styles.shutterOuter}
              onPress={handleCapture}
              disabled={!!resultText}
            >
              <View style={[styles.shutterInner, resultText ? styles.shutterDisabled : null]} />
            </Pressable>
          )}
          <Text style={styles.captureHint}>
            {mode === 'vin' && showVinMode
              ? 'Auto-scanning barcodes \u2022 Tap to OCR'
              : 'Tap to capture plate'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const OVERLAY_COLOR = 'rgba(0,0,0,0.55)';
const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;
const ACCENT = Theme.colors.primary;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  permissionContainer: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  permissionTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 8 },
  permissionText: { fontSize: 15, color: '#9CA3AF', textAlign: 'center', lineHeight: 22 },
  permissionBtn: {
    backgroundColor: ACCENT,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginTop: 8,
  },
  permissionBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  permissionCancelBtn: { paddingVertical: 12 },
  permissionCancelText: { color: '#6B7280', fontSize: 15, fontWeight: '600' },

  overlayTop: { width: SCREEN_W, height: VIEWFINDER_TOP, backgroundColor: OVERLAY_COLOR },
  overlayMiddleRow: { flexDirection: 'row', height: VIEWFINDER_H },
  overlaySide: { flex: 1, backgroundColor: OVERLAY_COLOR },
  viewfinder: { width: VIEWFINDER_W, height: VIEWFINDER_H },
  overlayBottom: { flex: 1, backgroundColor: OVERLAY_COLOR },

  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: 4,
    borderColor: ACCENT,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: 4,
    borderColor: ACCENT,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: 4,
    borderColor: ACCENT,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: 4,
    borderColor: ACCENT,
  },

  scanLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: '50%',
    height: 2,
    backgroundColor: ACCENT,
    opacity: 0.7,
    borderRadius: 1,
  },

  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    padding: 3,
  },
  modeBtn: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 8 },
  modeBtnActive: { backgroundColor: ACCENT },
  modeText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  modeTextActive: { color: '#fff' },
  modeLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },

  instructions: {
    position: 'absolute',
    top: VIEWFINDER_TOP + VIEWFINDER_H + 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    paddingHorizontal: 32,
    fontWeight: '500',
  },

  resultOverlay: {
    position: 'absolute',
    top: VIEWFINDER_TOP + VIEWFINDER_H + 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  resultText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 2,
    textAlign: 'center',
    paddingHorizontal: 16,
  },

  bottomBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 50 : 30,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 12,
  },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  shutterDisabled: { backgroundColor: 'rgba(255,255,255,0.3)' },
  captureHint: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
});
