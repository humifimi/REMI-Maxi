import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { OperatorState, UpcomingObligation } from "@profit-model/types";
import { Accordion } from "../accordion";
import { CurrencyInput } from "../controls/CurrencyInput";
import { DynamicList } from "../controls/DynamicList";
import { DateField } from "./DateField";

// Mirrors REMIDashboard `_components/operator-sections/UpcomingObligationsSection.tsx`.
// The 8-category select on web becomes a wrapping chip row on mobile so all
// categories stay reachable without a picker modal. Add/remove flows go
// through the parent's `onObligationsChange` callback rather than the dotted
// path setter — splice/concat semantics are clearer this way.

type Props = {
  operatorState: OperatorState;
  setOperatorField: (path: string, value: unknown) => void;
  onObligationsChange: (next: UpcomingObligation[]) => void;
};

const CATEGORY_OPTIONS: Array<{
  value: UpcomingObligation["category"];
  label: string;
}> = [
  { value: "sales_tax", label: "Sales tax" },
  { value: "loan", label: "Loan" },
  { value: "payroll", label: "Payroll" },
  { value: "owner_draw", label: "Owner draw" },
  { value: "rent", label: "Rent" },
  { value: "utility", label: "Utility" },
  { value: "cogs", label: "COGS" },
  { value: "other", label: "Other" },
];

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function newObligation(): UpcomingObligation {
  const due = new Date(Date.now() + 30 * 86_400_000);
  return {
    id: uid("oblig"),
    name: "",
    amount: 0,
    due_date: due.toISOString().slice(0, 10),
    category: "other",
  };
}

export function UpcomingObligationsSection({
  operatorState,
  setOperatorField,
  onObligationsChange,
}: Props) {
  const obligations = operatorState.upcoming_obligations;

  const handleAdd = () => {
    onObligationsChange([...obligations, newObligation()]);
  };

  const handleRemove = (index: number) => {
    onObligationsChange(obligations.filter((_, i) => i !== index));
  };

  return (
    <Accordion
      title="3. Upcoming obligations"
      subtitle={
        obligations.length === 0
          ? "Add bills due in the next 90 days"
          : `${obligations.length} item${obligations.length === 1 ? "" : "s"}`
      }
    >
      <Text style={styles.intro}>
        Big-ticket payments due in the next 90 days. Used to compute runway and
        severity flags.
      </Text>
      <DynamicList
        items={obligations}
        addLabel="Add obligation"
        emptyHint="No upcoming obligations entered. Add at least your next loan payment and quarterly sales tax for an accurate runway estimate."
        onAdd={handleAdd}
        onRemove={handleRemove}
        renderItem={(o, i) => (
          <View style={styles.card}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.textInput}
                value={o.name}
                placeholder="e.g. Q1 sales tax"
                placeholderTextColor="#9CA3AF"
                onChangeText={(v) =>
                  setOperatorField(`upcoming_obligations[${i}].name`, v)
                }
              />
            </View>
            <CurrencyInput
              label="Amount"
              value={o.amount}
              onChange={(v) =>
                setOperatorField(`upcoming_obligations[${i}].amount`, v)
              }
            />
            <DateField
              label="Due date"
              value={o.due_date}
              onChange={(v) =>
                setOperatorField(`upcoming_obligations[${i}].due_date`, v)
              }
            />
            <View>
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.chipRow}>
                {CATEGORY_OPTIONS.map((opt) => {
                  const active = opt.value === o.category;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.chip, active && styles.chipActive]}
                      hitSlop={4}
                      onPress={() =>
                        setOperatorField(
                          `upcoming_obligations[${i}].category`,
                          opt.value
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        )}
      />
    </Accordion>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 16,
  },
  card: {
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 10,
    gap: 10,
  },
  field: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    fontSize: 16,
    color: "#111827",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    minHeight: 32,
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  chipTextActive: {
    color: "#fff",
  },
});
