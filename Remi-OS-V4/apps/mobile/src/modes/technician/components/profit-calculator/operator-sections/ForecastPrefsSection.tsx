import type { OperatorState } from "@profit-model/types";
import { Accordion } from "../accordion";
import { NumberInput } from "../controls/NumberInput";
import { SegmentedToggle } from "../controls/SegmentedToggle";

// Mirrors REMIDashboard `_components/operator-sections/ForecastPrefsSection.tsx`.
// 90-day vs 13-week toggle drives the cash forecast horizon; the optional
// growth override falls back to the investor-mode `annual_revenue_growth_pct`
// so we don't surprise the operator with a different curve.

type Horizon = OperatorState["forecast"]["horizon"];

type Props = {
  operatorState: OperatorState;
  defaultGrowthPct: number;
  setOperatorField: (path: string, value: unknown) => void;
};

export function ForecastPrefsSection({
  operatorState,
  defaultGrowthPct,
  setOperatorField,
}: Props) {
  const horizon = operatorState.forecast.horizon;
  const overrideValue =
    operatorState.forecast.revenue_growth_pct_override ?? defaultGrowthPct;

  return (
    <Accordion
      title="4. Forecast preferences"
      subtitle={horizon === "13_weeks" ? "13-week forecast" : "90-day forecast"}
    >
      <SegmentedToggle<Horizon>
        label="Forecast horizon"
        value={horizon}
        options={[
          { value: "90_days", label: "90-day" },
          { value: "13_weeks", label: "13-week" },
        ]}
        onChange={(v) => setOperatorField("forecast.horizon", v)}
      />
      <NumberInput
        label="Override revenue growth assumption"
        value={overrideValue}
        min={-25}
        max={50}
        decimals={1}
        suffix="%"
        hint={`Defaults to investor-mode growth assumption (${defaultGrowthPct}%).`}
        onChange={(v) =>
          setOperatorField("forecast.revenue_growth_pct_override", v)
        }
      />
    </Accordion>
  );
}
