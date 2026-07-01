import { StyleSheet, View, Text, TextInput } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export interface NewCustomerFields {
  full_name: string;
  phone: string;
  email: string;
}

interface NewCustomerFormProps {
  value: NewCustomerFields;
  onChange: (next: NewCustomerFields) => void;
  disabled?: boolean;
}

// Inline name + optional phone + optional email form for walk-ins where the
// scanned vehicle has no linked customer. Values are sent on POST
// /customers as `{ full_name, phone?, email? }`.
export function NewCustomerForm({
  value,
  onChange,
  disabled,
}: NewCustomerFormProps) {
  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <MaterialIcons name="person-add" size={14} color="#3B82F6" />
        <Text style={styles.badgeText}>New Customer</Text>
      </View>
      <TextInput
        style={[styles.input, disabled && styles.inputDisabled]}
        placeholder="Full name"
        placeholderTextColor="#9CA3AF"
        value={value.full_name}
        onChangeText={(full_name) => onChange({ ...value, full_name })}
        autoCapitalize="words"
        editable={!disabled}
      />
      <TextInput
        style={[styles.input, disabled && styles.inputDisabled]}
        placeholder="Phone (optional)"
        placeholderTextColor="#9CA3AF"
        value={value.phone}
        onChangeText={(phone) => onChange({ ...value, phone })}
        keyboardType="phone-pad"
        editable={!disabled}
      />
      <TextInput
        style={[styles.input, disabled && styles.inputDisabled]}
        placeholder="Email (optional)"
        placeholderTextColor="#9CA3AF"
        value={value.email}
        onChangeText={(email) => onChange({ ...value, email })}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#3B82F6",
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minHeight: 48,
  },
  inputDisabled: {
    opacity: 0.5,
  },
});
