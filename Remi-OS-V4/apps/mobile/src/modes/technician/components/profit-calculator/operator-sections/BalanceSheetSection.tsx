import { StyleSheet, Text, View } from "react-native";
import type { OperatorState } from "@profit-model/types";
import { Accordion } from "../accordion";
import { CurrencyInput } from "../controls/CurrencyInput";

// Mirrors REMIDashboard `_components/operator-sections/BalanceSheetSection.tsx`.
// Three-tier progressive disclosure: tier 1 (cash on hand) is always visible,
// tiers 2 (AR/AP/inventory) and 3 (full balance sheet) live behind nested
// inner Accordions per the prompt. Each call site uses the dotted-path setter
// so we don't have to hand-spread the OperatorState shape.

type Props = {
  operatorState: OperatorState;
  setOperatorField: (path: string, value: unknown) => void;
};

const TIER2_DEFAULTS = {
  accounts_receivable: 0,
  accounts_payable: 0,
  inventory_value: 0,
};

const TIER3_DEFAULTS = {
  prepaid_expenses: 0,
  accrued_expenses: 0,
  credit_card_balance: 0,
  line_of_credit_drawn: 0,
  line_of_credit_limit: 0,
  other_current_assets: 0,
  other_current_liabilities: 0,
};

export function BalanceSheetSection({ operatorState, setOperatorField }: Props) {
  const cash = operatorState.balance_sheet_light.cash_on_hand;
  // Tier 2/3 are optional in the input contract — render-time defaults keep
  // CurrencyInput happy without forcing the parent to materialize empty
  // objects (engine treats absent === all-zero anyway).
  const tier2 = operatorState.balance_sheet_medium ?? TIER2_DEFAULTS;
  const tier3 = operatorState.balance_sheet_heavy ?? TIER3_DEFAULTS;

  return (
    <Accordion
      title="2. Balance sheet"
      subtitle={`$${Math.round(cash).toLocaleString()} cash on hand`}
    >
      <CurrencyInput
        label="Cash on hand"
        value={cash}
        hint="Total operating cash across all bank accounts at period end."
        onChange={(v) => setOperatorField("balance_sheet_light.cash_on_hand", v)}
        glossaryKey="runway"
        sourceProvider="manual"
      />
      <View style={styles.note}>
        <Text style={styles.noteText}>
          Cash on hand alone runs the basic diagnostic. Add detail below for a
          sharper read on working capital.
        </Text>
      </View>

      <Accordion title="Add receivables / payables">
        <CurrencyInput
          label="Accounts receivable"
          value={tier2.accounts_receivable}
          hint="Invoices outstanding at period end."
          onChange={(v) =>
            setOperatorField("balance_sheet_medium.accounts_receivable", v)
          }
          glossaryKey="trapped_working_capital"
          sourceProvider="manual"
        />
        <CurrencyInput
          label="Accounts payable"
          value={tier2.accounts_payable}
          hint="Vendor bills unpaid at period end."
          onChange={(v) =>
            setOperatorField("balance_sheet_medium.accounts_payable", v)
          }
          glossaryKey="trapped_working_capital"
          sourceProvider="manual"
        />
        <CurrencyInput
          label="Inventory value"
          value={tier2.inventory_value}
          hint="On-hand inventory at cost."
          onChange={(v) =>
            setOperatorField("balance_sheet_medium.inventory_value", v)
          }
          glossaryKey="trapped_working_capital"
          sourceProvider="manual"
        />
      </Accordion>

      <Accordion title="Add full balance sheet">
        <CurrencyInput
          label="Prepaid expenses"
          value={tier3.prepaid_expenses}
          onChange={(v) =>
            setOperatorField("balance_sheet_heavy.prepaid_expenses", v)
          }
        />
        <CurrencyInput
          label="Accrued expenses"
          value={tier3.accrued_expenses}
          onChange={(v) =>
            setOperatorField("balance_sheet_heavy.accrued_expenses", v)
          }
        />
        <CurrencyInput
          label="Credit card balance"
          value={tier3.credit_card_balance}
          onChange={(v) =>
            setOperatorField("balance_sheet_heavy.credit_card_balance", v)
          }
        />
        <CurrencyInput
          label="Line of credit drawn"
          value={tier3.line_of_credit_drawn}
          onChange={(v) =>
            setOperatorField("balance_sheet_heavy.line_of_credit_drawn", v)
          }
        />
        <CurrencyInput
          label="Line of credit limit"
          value={tier3.line_of_credit_limit}
          onChange={(v) =>
            setOperatorField("balance_sheet_heavy.line_of_credit_limit", v)
          }
        />
        <CurrencyInput
          label="Other current assets"
          value={tier3.other_current_assets}
          onChange={(v) =>
            setOperatorField("balance_sheet_heavy.other_current_assets", v)
          }
        />
        <CurrencyInput
          label="Other current liabilities"
          value={tier3.other_current_liabilities}
          onChange={(v) =>
            setOperatorField("balance_sheet_heavy.other_current_liabilities", v)
          }
        />
      </Accordion>
    </Accordion>
  );
}

const styles = StyleSheet.create({
  note: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  noteText: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 16,
  },
});
