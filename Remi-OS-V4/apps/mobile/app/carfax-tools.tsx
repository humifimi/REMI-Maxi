import { useCallback, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  useQuickVinLookup,
  useServiceHistoryLookup,
} from "@technician/hooks/carfax/use-carfax-lookups";
import VehicleScanner from "@technician/components/job/vehicle-scanner";
import { haptic } from "@technician/hooks/utility/use-haptics";
import type {
  QuickVinLookupResult,
  ServiceHistoryResult,
} from "@technician/types/api";

type ScannerMode = "plate" | "vin";

/**
 * Operator tool for hitting the two read-only Carfax APIs from the field.
 *
 * - QuickVIN Plus: turn a US license plate (plate + 2-letter state) into
 *   a 17-character VIN. Useful when a customer hasn't provided their VIN.
 * - Service History Check: pull the prior-service feed for a VIN.
 *
 * Both calls are routed through the backend (`/api/v1/carfax/quickvin`
 * and `/api/v1/carfax/service-history`) which holds the comp-code +
 * product-data-id and never exposes them to the client. These are
 * read-only — they do NOT push anything to Carfax — so they're safe to
 * run live regardless of `CARFAX_REPORT_MODE`.
 *
 * Both inputs support camera scanning via the shared `VehicleScanner`:
 * plates → Plate Recognizer on the backend; VIN → barcode auto-scan plus
 * on-device ML Kit OCR with backend Tesseract fallback.
 */
export default function CarfaxToolsScreen() {
  const router = useRouter();
  const [scannerMode, setScannerMode] = useState<ScannerMode | null>(null);
  const [plate, setPlate] = useState("");
  const [stateInput, setStateInput] = useState("");
  const [vin, setVin] = useState("");

  const handleScanResult = useCallback(
    (text: string, mode: ScannerMode, detectedState?: string | null) => {
      setScannerMode(null);
      haptic.light();
      if (mode === "plate") {
        setPlate(text);
        if (detectedState) setStateInput(detectedState.toUpperCase());
      } else {
        setVin(text);
      }
    },
    [],
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "CARFAX Tools",
          headerStyle: { backgroundColor: "#111827" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "700" },
          headerTitleAlign: "center",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.disclaimer}>
            These look-ups query CARFAX directly. Nothing is reported to
            CARFAX from this screen — they are read-only.
          </Text>

          <QuickVinSection
            plate={plate}
            setPlate={setPlate}
            stateInput={stateInput}
            setStateInput={setStateInput}
            onScanPress={() => setScannerMode("plate")}
          />
          <ServiceHistorySection
            vin={vin}
            setVin={setVin}
            onScanPress={() => setScannerMode("vin")}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {scannerMode ? (
        <VehicleScanner
          visible
          initialMode={scannerMode}
          onScan={handleScanResult}
          onClose={() => setScannerMode(null)}
        />
      ) : null}
    </>
  );
}

interface QuickVinSectionProps {
  plate: string;
  setPlate: (value: string) => void;
  stateInput: string;
  setStateInput: (value: string) => void;
  onScanPress: () => void;
}

function QuickVinSection({
  plate,
  setPlate,
  stateInput,
  setStateInput,
  onScanPress,
}: QuickVinSectionProps) {
  const lookup = useQuickVinLookup();
  const result = lookup.data;
  const error = lookup.error as
    | { response?: { data?: { message?: string } }; message?: string }
    | null;

  const canSubmit =
    plate.trim().length >= 1 &&
    stateInput.trim().length === 2 &&
    !lookup.isPending;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <MaterialIcons name="directions-car" size={20} color="#3B82F6" />
        <Text style={styles.cardTitle}>QuickVIN — Plate to VIN</Text>
      </View>

      <View style={styles.inputRow}>
        <View style={[styles.inputGroup, { flex: 2 }]}>
          <Text style={styles.label}>License Plate</Text>
          <View style={styles.inputWithButton}>
            <TextInput
              value={plate}
              onChangeText={setPlate}
              placeholder="ABC1234"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.input, styles.inputFlex]}
              maxLength={10}
            />
            <Pressable
              style={styles.scanBtn}
              onPress={() => {
                haptic.light();
                onScanPress();
              }}
              hitSlop={6}
              accessibilityLabel="Scan license plate"
            >
              <MaterialIcons name="photo-camera" size={20} color="#3B82F6" />
            </Pressable>
          </View>
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>State</Text>
          <TextInput
            value={stateInput}
            onChangeText={setStateInput}
            placeholder="TX"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
            maxLength={2}
          />
        </View>
      </View>

      <Pressable
        style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
        disabled={!canSubmit}
        onPress={() => {
          haptic.medium();
          lookup.mutate({ plate, state: stateInput });
        }}
      >
        {lookup.isPending ? (
          <ActivityIndicator size={16} color="#fff" />
        ) : (
          <MaterialIcons name="search" size={16} color="#fff" />
        )}
        <Text style={styles.submitBtnText}>
          {lookup.isPending ? "Looking up…" : "Look up VIN"}
        </Text>
      </Pressable>

      {error ? (
        <ErrorBanner
          message={
            error.response?.data?.message ??
            error.message ??
            "Lookup failed."
          }
        />
      ) : null}

      {result ? <QuickVinResultCard result={result} /> : null}
    </View>
  );
}

function QuickVinResultCard({ result }: { result: QuickVinLookupResult }) {
  if (!result.vin) {
    return (
      <View style={styles.resultEmpty}>
        <MaterialIcons name="info" size={16} color="#6B7280" />
        <Text style={styles.resultEmptyText}>
          No VIN returned for this plate / state combination.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.resultCard}>
      <Row label="VIN" value={result.vin} mono />
      <Row label="Year" value={result.year ?? "—"} />
      <Row label="Make" value={result.make ?? "—"} />
      <Row label="Model" value={result.model ?? "—"} />
    </View>
  );
}

interface ServiceHistorySectionProps {
  vin: string;
  setVin: (value: string) => void;
  onScanPress: () => void;
}

function ServiceHistorySection({
  vin,
  setVin,
  onScanPress,
}: ServiceHistorySectionProps) {
  const lookup = useServiceHistoryLookup();
  const result = lookup.data;
  const error = lookup.error as
    | { response?: { data?: { message?: string } }; message?: string }
    | null;

  const canSubmit = vin.trim().length === 17 && !lookup.isPending;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <MaterialIcons name="history" size={20} color="#3B82F6" />
        <Text style={styles.cardTitle}>Service History — VIN to Records</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>VIN</Text>
        <View style={styles.inputWithButton}>
          <TextInput
            value={vin}
            onChangeText={setVin}
            placeholder="17-character VIN"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, styles.inputFlex]}
            maxLength={17}
          />
          <Pressable
            style={styles.scanBtn}
            onPress={() => {
              haptic.light();
              onScanPress();
            }}
            hitSlop={6}
            accessibilityLabel="Scan VIN"
          >
            <MaterialIcons name="photo-camera" size={20} color="#3B82F6" />
          </Pressable>
        </View>
        <Text style={styles.hint}>
          {vin.trim().length}/17 characters
        </Text>
      </View>

      <Pressable
        style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
        disabled={!canSubmit}
        onPress={() => {
          haptic.medium();
          lookup.mutate({ vin });
        }}
      >
        {lookup.isPending ? (
          <ActivityIndicator size={16} color="#fff" />
        ) : (
          <MaterialIcons name="search" size={16} color="#fff" />
        )}
        <Text style={styles.submitBtnText}>
          {lookup.isPending ? "Fetching…" : "Pull service history"}
        </Text>
      </Pressable>

      {error ? (
        <ErrorBanner
          message={
            error.response?.data?.message ??
            error.message ??
            "Lookup failed."
          }
        />
      ) : null}

      {result ? <ServiceHistoryResultCard result={result} /> : null}
    </View>
  );
}

function ServiceHistoryResultCard({
  result,
}: {
  result: ServiceHistoryResult;
}) {
  const carfaxErrors = result.errorMessages?.errors ?? [];
  const sh = result.serviceHistory;

  if (carfaxErrors.length > 0 && !sh) {
    return (
      <View style={styles.resultEmpty}>
        <MaterialIcons name="warning" size={16} color="#B45309" />
        <Text style={styles.resultEmptyText}>
          {carfaxErrors.map((e) => e.message).join("; ")}
        </Text>
      </View>
    );
  }

  if (!sh) {
    return (
      <View style={styles.resultEmpty}>
        <MaterialIcons name="info" size={16} color="#6B7280" />
        <Text style={styles.resultEmptyText}>
          CARFAX returned no service-history payload for this VIN.
        </Text>
      </View>
    );
  }

  const records = sh.displayRecords ?? [];
  return (
    <View style={styles.resultCard}>
      <Row label="VIN" value={sh.vin ?? "—"} mono />
      <Row
        label="Vehicle"
        value={[sh.year, sh.make, sh.model].filter(Boolean).join(" ") || "—"}
      />
      {sh.bodyTypeDescription ? (
        <Row label="Body" value={sh.bodyTypeDescription} />
      ) : null}
      {sh.engineInformation ? (
        <Row label="Engine" value={sh.engineInformation} />
      ) : null}
      {sh.driveline ? <Row label="Drive" value={sh.driveline} /> : null}
      <Row
        label="Records"
        value={String(sh.numberOfServiceRecords ?? records.length)}
      />

      {records.length > 0 ? (
        <>
          <Text style={styles.recordsHeader}>Recent service records</Text>
          {records.slice(0, 10).map((r, idx) => (
            <View key={idx} style={styles.recordRow}>
              <View style={styles.recordMeta}>
                <Text style={styles.recordDate}>{r.displayDate ?? "—"}</Text>
                {r.odometer ? (
                  <Text style={styles.recordOdo}>{r.odometer} mi</Text>
                ) : null}
              </View>
              {r.text && r.text.length > 0 ? (
                <Text style={styles.recordText}>
                  {r.text.slice(0, 4).join(" · ")}
                  {r.text.length > 4 ? "…" : ""}
                </Text>
              ) : null}
            </View>
          ))}
          {records.length > 10 ? (
            <Text style={styles.recordsFooter}>
              + {records.length - 10} more record(s)
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text
        style={[styles.resultValue, mono && styles.resultValueMono]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <MaterialIcons name="error-outline" size={16} color="#B91C1C" />
      <Text style={styles.errorBannerText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    padding: 16,
  },
  disclaimer: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 12,
    lineHeight: 18,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
  },
  inputGroup: {
    gap: 6,
  },
  inputWithButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputFlex: {
    flex: 1,
  },
  scanBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fff",
    color: "#111827",
  },
  hint: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#3B82F6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    minHeight: 44,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    padding: 10,
  },
  errorBannerText: {
    flex: 1,
    color: "#B91C1C",
    fontSize: 13,
  },
  resultEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 10,
  },
  resultEmptyText: {
    flex: 1,
    color: "#6B7280",
    fontSize: 13,
  },
  resultCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    minWidth: 80,
  },
  resultValue: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    textAlign: "right",
    fontWeight: "500",
  },
  resultValueMono: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 13,
  },
  recordsHeader: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recordRow: {
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 4,
  },
  recordMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  recordDate: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  recordOdo: {
    fontSize: 12,
    color: "#6B7280",
  },
  recordText: {
    fontSize: 12,
    color: "#374151",
    lineHeight: 16,
  },
  recordsFooter: {
    fontSize: 11,
    color: "#9CA3AF",
    fontStyle: "italic",
    textAlign: "right",
  },
});
