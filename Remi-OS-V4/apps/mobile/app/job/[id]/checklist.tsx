import { useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Switch,
  TextInput,
  Pressable,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { useChecklist, useSubmitChecklist } from "@technician/hooks/jobs/use-checklist";
import { useFlowBack } from "@technician/hooks/jobs/use-flow-back";
import { useCreateDeferredItem } from "@technician/hooks/jobs/use-deferred-work";
import { useRecordTread, useTreadHistory } from "@technician/hooks/jobs/use-tread-tracking";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { DeferredItemCapture } from "@technician/components/service/deferred-item-capture";
import { TireTreadInput } from "@technician/components/service/tire-tread-input";
import { CHECKLIST_LABEL_TO_OBSERVATION } from "@technician/constants/checklist-mappings";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { extractErrorMessage } from "@technician/api/errors";
import type { ChecklistSubmitItem, InspectionTemplateField, Service, TirePosition } from "@technician/types/api";
import type { ObservationType } from "@technician/types/enums";

export default function ChecklistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = parseInt(id, 10);
  const router = useRouter();
  const onBack = useFlowBack("checklist", id);
  const { data: checklist, isLoading } = useChecklist(jobId);
  const submit = useSubmitChecklist();
  const createDeferred = useCreateDeferredItem();
  const { appointmentId, vehicle, customer, addDeferredItem, removeDeferredItem, deferredItems } =
    useJobFlowStore();

  const [values, setValues] = useState<Record<number, string>>({});
  const [flaggedFields, setFlaggedFields] = useState<Set<number>>(new Set());

  const vehicleId = vehicle?.id ?? 0;
  const recordTread = useRecordTread(jobId);
  const { data: treadHistory } = useTreadHistory(vehicleId);
  const [treadValues, setTreadValues] = useState<Record<TirePosition, string>>({
    left_front: "",
    right_front: "",
    left_rear: "",
    right_rear: "",
  });
  const handleTreadChange = (pos: TirePosition, val: string) => {
    setTreadValues((prev) => ({ ...prev, [pos]: val }));
  };

  const { data: availableServices = [] } = useQuery({
    queryKey: ["available-services", jobId],
    queryFn: () => api<Service[]>("get", `/jobs/${jobId}/services`).catch(() => []),
    staleTime: 300_000,
  });

  const updateValue = (fieldId: number, value: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const toggleFlagged = (fieldId: number, isFlagged: boolean, fieldLabel: string) => {
    setFlaggedFields((prev) => {
      const next = new Set(prev);
      if (isFlagged) {
        next.add(fieldId);
      } else {
        next.delete(fieldId);
        const obsType = CHECKLIST_LABEL_TO_OBSERVATION[fieldLabel];
        if (obsType) removeDeferredItem(obsType);
      }
      return next;
    });
  };

  const handleDeferredUpdate = (
    fieldLabel: string,
    data: {
      observationType: ObservationType;
      severity: "low" | "medium" | "high";
      recommendedServiceId?: number;
      estimatedCost?: number;
      photoUri?: string;
      notes?: string;
    }
  ) => {
    if (!appointmentId || !vehicle || !customer) return;
    addDeferredItem({
      appointment_id: appointmentId,
      vehicle_id: vehicle.id,
      customer_id: customer.id,
      observation_type: data.observationType,
      severity: data.severity,
      recommended_service_id: data.recommendedServiceId,
      estimated_cost: data.estimatedCost,
      photo_url: data.photoUri,
      notes: data.notes,
    });
  };

  const handleSubmit = async () => {
    const templateFields = checklist?.template?.fields ?? [];
    const items: ChecklistSubmitItem[] = templateFields.map(
      (field) => ({
        template_field_id: field.id,
        value: values[field.id] ?? (field.field_type === "toggle" ? "ok" : ""),
      })
    );

    try {
      if (items.length > 0) {
        await submit.mutateAsync({ jobId, items });
      }

      for (const deferredPayload of deferredItems) {
        await createDeferred.mutateAsync(deferredPayload);
      }

      const treadReadings = (Object.entries(treadValues) as [TirePosition, string][])
        .filter(([, v]) => v.trim().length > 0 && !isNaN(parseFloat(v)))
        .map(([pos, v]) => ({ position: pos, depth_mm: parseFloat(v) }));
      if (treadReadings.length > 0 && vehicleId > 0) {
        await recordTread.mutateAsync({ vehicleId, readings: treadReadings });
      }

      haptic.medium();
      router.push(`/job/${id}/fluids` as never);
    } catch (err) {
      Alert.alert("Could not submit checklist", extractErrorMessage(err));
    }
  };

  const isSubmitting = submit.isPending || createDeferred.isPending || recordTread.isPending;

  if (isLoading) {
    return <SkeletonListScreen cards={5} />;
  }

  const fields = checklist?.template?.fields ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          title: "Pre-Service Checklist",
          headerLeft: () => (
            <Pressable onPress={onBack} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.container}>
        <Text style={styles.templateName}>
          {checklist?.template?.name ?? "Vehicle Inspection"}
        </Text>

        {fields.map((field) => (
          <ChecklistField
            key={field.id}
            field={field}
            value={values[field.id] ?? ""}
            isFlagged={flaggedFields.has(field.id)}
            services={availableServices}
            onChange={(v) => updateValue(field.id, v)}
            onFlagToggle={(flagged) => toggleFlagged(field.id, flagged, field.label)}
            onDeferredUpdate={(data) => handleDeferredUpdate(field.label, data)}
            onDeferredRemove={() => {
              toggleFlagged(field.id, false, field.label);
              updateValue(field.id, "ok");
            }}
          />
        ))}

        {fields.length === 0 ? (
          <Text style={styles.emptyText}>
            No checklist template configured for this job.
          </Text>
        ) : null}

        <TireTreadInput
          values={treadValues}
          onChange={handleTreadChange}
          history={treadHistory}
        />

        {deferredItems.length > 0 ? (
          <View style={styles.flaggedSummary}>
            <MaterialIcons name="warning" size={16} color="#F97316" />
            <Text style={styles.flaggedSummaryText}>
              {deferredItems.length} issue{deferredItems.length !== 1 ? "s" : ""} flagged
            </Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.submitBtn, isSubmitting && styles.disabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          <Text style={styles.submitText}>
            {isSubmitting ? "Submitting..." : "Submit & Start Service"}
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function ChecklistField({
  field,
  value,
  isFlagged,
  services,
  onChange,
  onFlagToggle,
  onDeferredUpdate,
  onDeferredRemove,
}: {
  field: InspectionTemplateField;
  value: string;
  isFlagged: boolean;
  services: Service[];
  onChange: (value: string) => void;
  onFlagToggle: (flagged: boolean) => void;
  onDeferredUpdate: (data: {
    observationType: ObservationType;
    severity: "low" | "medium" | "high";
    recommendedServiceId?: number;
    estimatedCost?: number;
    photoUri?: string;
    notes?: string;
  }) => void;
  onDeferredRemove: () => void;
}) {
  const observationType = CHECKLIST_LABEL_TO_OBSERVATION[field.label];

  const handleToggle = (isOk: boolean) => {
    onChange(isOk ? "ok" : "issue");
    if (!isOk && observationType) {
      onFlagToggle(true);
    } else if (isOk && isFlagged) {
      onFlagToggle(false);
    }
  };

  switch (field.field_type) {
    case "toggle":
      return (
        <View>
          <View
            style={[
              styles.toggleRow,
              isFlagged && styles.toggleRowFlagged,
            ]}
          >
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <Switch
              value={value === "ok" || value === "true" || value === ""}
              onValueChange={handleToggle}
              trackColor={{ true: "#22C55E", false: "#FECACA" }}
              thumbColor="#fff"
            />
          </View>
          {isFlagged && observationType ? (
            <DeferredItemCapture
              fieldLabel={field.label}
              observationType={observationType}
              services={services}
              onUpdate={onDeferredUpdate}
              onRemove={onDeferredRemove}
            />
          ) : null}
        </View>
      );
    case "numeric":
      return (
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChange}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#9CA3AF"
          />
        </View>
      );
    case "text":
      return (
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={value}
            onChangeText={onChange}
            multiline
            placeholder="Notes..."
            placeholderTextColor="#9CA3AF"
          />
        </View>
      );
    case "photo":
      return (
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <Pressable style={styles.photoBtn}>
            <Text style={styles.photoBtnText}>Take Photo</Text>
          </Pressable>
        </View>
      );
    default:
      return (
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChange}
            placeholder="Enter value"
            placeholderTextColor="#9CA3AF"
          />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  templateName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 20,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  toggleRowFlagged: {
    borderColor: "#FDBA74",
    backgroundColor: "#FFFBEB",
    marginBottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  flaggedSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF7ED",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  flaggedSummaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9A3412",
  },
  fieldBlock: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  photoBtn: {
    backgroundColor: "#E5E7EB",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  photoBtnText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  emptyText: {
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: 15,
    paddingVertical: 40,
  },
  submitBtn: {
    backgroundColor: "#3B82F6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
    marginBottom: 40,
  },
  disabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
