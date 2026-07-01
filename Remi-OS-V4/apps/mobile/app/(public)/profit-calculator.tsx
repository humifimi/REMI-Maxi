import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { calculate } from "@profit-model/engine";
import { currency, months_to_human, percent } from "@profit-model/format";
import type {
  ProfitModelInputs,
  ServiceLine,
  Employee,
  FixedCostLine,
  OperatorState,
  UpcomingObligation,
} from "@profit-model/types";
import { defaults } from "@profit-model/presets";
import {
  usePersistedScenario,
  clearPersistedScenario,
} from "@technician/hooks/profit-calculator/use-persisted-scenario";
import {
  useCreateAnonymousProfitSession,
  useCreateAuthenticatedProfitSession,
  useUpdateProfitSession,
} from "@technician/hooks/profit-calculator/use-profit-sessions";
import { useProfitModelDraftStore } from "@technician/stores/profit-model-draft-store";
import { useAuthStore } from "@/src/stores/auth";
import { Config } from "@technician/constants/config";
import type { ProfitModelSession } from "@technician/types/profit-model";
import { KpiTile } from "@technician/components/profit-calculator/kpi-tile";
import { Accordion } from "@technician/components/profit-calculator/accordion";
import { GlossarySheet } from "@technician/components/profit-calculator/glossary-sheet";
import { GLOSSARY } from "@profit-model/glossary";
import { NumberInput } from "@technician/components/profit-calculator/controls/NumberInput";
import { CurrencyInput } from "@technician/components/profit-calculator/controls/CurrencyInput";
import { PercentInput } from "@technician/components/profit-calculator/controls/PercentInput";
import { SegmentedToggle } from "@technician/components/profit-calculator/controls/SegmentedToggle";
import { DynamicList } from "@technician/components/profit-calculator/controls/DynamicList";
import { DetailedResultsModal } from "@technician/components/profit-calculator/detailed-results-modal";
import { SaveScenarioModal } from "@technician/components/profit-calculator/save-scenario-modal";
import { ScenariosModal } from "@technician/components/profit-calculator/scenarios-modal";
import { ShareLinkModal } from "@technician/components/profit-calculator/share-link-modal";
import { PeriodSection } from "@technician/components/profit-calculator/operator-sections/PeriodSection";
import { BalanceSheetSection } from "@technician/components/profit-calculator/operator-sections/BalanceSheetSection";
import { UpcomingObligationsSection } from "@technician/components/profit-calculator/operator-sections/UpcomingObligationsSection";
import { ForecastPrefsSection } from "@technician/components/profit-calculator/operator-sections/ForecastPrefsSection";
import {
  setAtPath,
  deepClone,
} from "@technician/components/profit-calculator/operator-sections/path-utils";
import { ErrorBoundary } from "@/src/components/shared/error-boundary";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// PM-MIG-18 — operator KPI strip helpers. Kept here (not exported from a
// shared module) because nothing else on mobile consumes the runway status
// taxonomy yet; promote to `src/components/profit-calculator/operator-output/`
// if a second surface needs them.
type RunwayStatus = NonNullable<
  ReturnType<typeof calculate>["runway"]
>["status"];

function runwayTone(
  status: RunwayStatus
): "primary" | "neutral" | "warn" | "negative" {
  switch (status) {
    case "healthy":
      return "primary";
    case "caution":
      return "warn";
    case "warning":
      return "warn";
    case "critical":
      return "negative";
  }
}

function runwayStatusLabel(status: RunwayStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "caution":
      return "Caution";
    case "warning":
      return "Warning";
    case "critical":
      return "Critical";
  }
}

function criticalFlagCount(
  flags: ReturnType<typeof calculate>["severity_flags"]
): number {
  if (!flags) return 0;
  return flags.filter((f) => f.severity === "critical").length;
}

// Mirrors REMIDashboard `_components/ModeToggle.tsx::buildDefaultOperatorState`
// (PM-MIG-12). Keep these in sync — both surfaces must seed the same shape so
// the operator-mode engine path doesn't hit "missing required field" warnings
// the moment a fresh user toggles in.
function buildDefaultOperatorState(): OperatorState {
  const today = new Date();
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 86_400_000);
  return {
    period: {
      start_date: ninetyDaysAgo.toISOString().slice(0, 10),
      end_date: today.toISOString().slice(0, 10),
      net_sales: 0,
      cogs_total: 0,
      labor_total: 0,
      fixed_costs_total: 0,
    },
    balance_sheet_light: { cash_on_hand: 0 },
    upcoming_obligations: [],
    forecast: { horizon: "13_weeks" },
  };
}

function ProfitCalculatorScreenInner() {
  const router = useRouter();
  const { inputs, hydrated, setInputs } = usePersistedScenario();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [shareModal, setShareModal] = useState<{
    visible: boolean;
    url: string | null;
    expiresAt: string | null;
  }>({ visible: false, url: null, expiresAt: null });
  // PM-MIG-19 — Single glossary sheet driven by the operator-output cards
  // inside DetailedResultsModal. The screen-level <InfoIcon> instances each
  // own their own sheet (cheap to mount, never visible at the same time);
  // the modal needs a callback because its operator-output components
  // accept `onGlossaryPress` rather than embedding their own InfoIcons.
  const [glossaryKey, setGlossaryKey] = useState<string | null>(null);
  const handleGlossaryPress = useCallback((key: string) => {
    setGlossaryKey(key);
  }, []);
  const closeGlossary = useCallback(() => setGlossaryKey(null), []);
  const glossaryEntry = glossaryKey ? GLOSSARY[glossaryKey] : undefined;

  // Tracks the server-side session this screen is currently editing, if any.
  // - `null` = brand-new local-only scenario (Save → create)
  // - non-null & owned (`!is_anonymous`) = Save → update in place
  // - non-null & anonymous = Save → "save to my account" (create owned copy)
  const [currentSession, setCurrentSession] =
    useState<ProfitModelSession | null>(null);

  const consumePending = useProfitModelDraftStore((s) => s.consume);

  const createAuth = useCreateAuthenticatedProfitSession();
  const createAnon = useCreateAnonymousProfitSession();
  const updateSession = useUpdateProfitSession();

  // One-shot deep-link handoff: a freshly-mounted /share/[token] route stashes
  // the fetched session, this effect picks it up and applies it. Guarded on
  // `hydrated` so we don't race the SecureStore read and end up overwriting
  // ourselves with stale local inputs.
  useEffect(() => {
    if (!hydrated) return;
    const pending = consumePending();
    if (pending) {
      setInputs(pending.inputs);
      setCurrentSession(pending);
    }
  }, [hydrated, consumePending, setInputs]);

  const result = useMemo(() => {
    if (!hydrated) return null;
    try {
      return calculate(inputs);
    } catch {
      return null;
    }
  }, [inputs, hydrated]);

  const update = useCallback(
    (patch: Partial<ProfitModelInputs>) => {
      setInputs({ ...inputs, ...patch });
    },
    [inputs, setInputs]
  );

  // Tiny helper so the operator-mode sections can write nested fields with
  // dotted paths (e.g. "balance_sheet_medium.accounts_receivable") instead of
  // hand-spreading the OperatorState shape on every keystroke. Mirrors the
  // dashboard's `setInput("operator_state.<path>", value)` ergonomics; we
  // strip the leading "operator_state." segment because the path utility runs
  // against `inputs.operator_state` directly.
  const setOperatorField = useCallback(
    (path: string, value: unknown) => {
      const current = inputs.operator_state ?? buildDefaultOperatorState();
      const next = deepClone(current);
      setAtPath(next as unknown as Record<string, unknown>, path, value);
      update({ operator_state: next });
    },
    [inputs.operator_state, update]
  );

  const setObligations = useCallback(
    (next: UpcomingObligation[]) => {
      const current = inputs.operator_state ?? buildDefaultOperatorState();
      update({
        operator_state: { ...current, upcoming_obligations: next },
      });
    },
    [inputs.operator_state, update]
  );

  // PM-MIG-15 — investor/operator mode toggle. Mode lives on `inputs.mode` so
  // it round-trips through the persisted scenario blob (and any future share
  // codec) like every other field. Operator inputs/results land in
  // PM-MIG-17/18; for now this just gates which scroll content renders.
  const mode = inputs.mode ?? "investor";
  const setMode = useCallback(
    (next: "investor" | "operator") => {
      if (next === "operator" && !inputs.operator_state) {
        setInputs({
          ...inputs,
          mode: next,
          operator_state: buildDefaultOperatorState(),
        });
      } else {
        setInputs({ ...inputs, mode: next });
      }
    },
    [inputs, setInputs]
  );

  const updateService = useCallback(
    (id: string, patch: Partial<ServiceLine>) => {
      const next = inputs.services.map((s) => (s.id === id ? { ...s, ...patch } : s));
      update({ services: next });
    },
    [inputs.services, update]
  );

  const addService = useCallback(() => {
    update({
      services: [
        ...inputs.services,
        {
          id: uid("svc"),
          name: "New Service",
          trucks: 1,
          jobs_per_day_per_truck: 4,
          pricing_mode: "flat",
          flat_price: 100,
          flat_cogs: 30,
        },
      ],
    });
  }, [inputs.services, update]);

  const removeService = useCallback(
    (index: number) => {
      const next = inputs.services.filter((_, i) => i !== index);
      update({ services: next });
    },
    [inputs.services, update]
  );

  const updateEmployee = useCallback(
    (id: string, patch: Partial<Employee>) => {
      const next = inputs.employees.map((e) => (e.id === id ? { ...e, ...patch } : e));
      update({ employees: next });
    },
    [inputs.employees, update]
  );

  const addEmployee = useCallback(() => {
    update({
      employees: [
        ...inputs.employees,
        {
          id: uid("emp"),
          name: `Employee ${inputs.employees.length + 1}`,
          annual_salary: 50_000,
          role: "tech",
        },
      ],
    });
  }, [inputs.employees, update]);

  const removeEmployee = useCallback(
    (index: number) => {
      const next = inputs.employees.filter((_, i) => i !== index);
      update({ employees: next });
    },
    [inputs.employees, update]
  );

  const updateFixedCost = useCallback(
    (id: string, patch: Partial<FixedCostLine>) => {
      const next = inputs.fixed_costs.map((c) =>
        c.id === id ? { ...c, ...patch } : c
      );
      update({ fixed_costs: next });
    },
    [inputs.fixed_costs, update]
  );

  const addFixedCost = useCallback(() => {
    update({
      fixed_costs: [
        ...inputs.fixed_costs,
        {
          id: uid("fc"),
          name: "New Cost",
          monthly_amount: 250,
          growth_pct_per_year: 3,
        },
      ],
    });
  }, [inputs.fixed_costs, update]);

  const removeFixedCost = useCallback(
    (index: number) => {
      const next = inputs.fixed_costs.filter((_, i) => i !== index);
      update({ fixed_costs: next });
    },
    [inputs.fixed_costs, update]
  );

  // Authenticated tap: open the rename/save sheet. We always go through the
  // modal (even when updating) so the user can rename in place.
  const handleAuthenticatedSavePress = useCallback(() => {
    setSaveModalOpen(true);
  }, []);

  // Anonymous tap: skip the rename sheet and create the share link straight
  // away. Pre-PM-6 behavior was localStorage-only; we keep that automatic
  // (the persisted-scenario hook handles it) and add the share path on top.
  const handleAnonymousShare = useCallback(() => {
    createAnon.mutate(
      { inputs },
      {
        onSuccess: (session) => {
          const url = `${Config.WEB_ORIGIN}/tools/profit-model/share/${session.share_token}`;
          setShareModal({
            visible: true,
            url,
            expiresAt: session.expires_at,
          });
        },
        onError: () => {
          Alert.alert(
            "Couldn't create share link",
            "Check your connection and try again."
          );
        },
      }
    );
  }, [createAnon, inputs]);

  // Modal Save submit handler — branches on whether we're editing a session
  // we own (PUT) vs creating a fresh one (POST). Anonymous sessions promoted
  // to a logged-in account also fall through to POST so the new owner record
  // is established.
  const handleSaveSubmit = useCallback(
    (name: string) => {
      const isOwnedExisting =
        currentSession !== null && !currentSession.is_anonymous;

      const onError = () => {
        Alert.alert(
          "Couldn't save scenario",
          "Check your connection and try again."
        );
      };

      if (isOwnedExisting && currentSession) {
        updateSession.mutate(
          {
            shareToken: currentSession.share_token,
            patch: { inputs, name },
          },
          {
            onSuccess: (session) => {
              setCurrentSession(session);
              setSaveModalOpen(false);
            },
            onError,
          }
        );
      } else {
        createAuth.mutate(
          { inputs, name },
          {
            onSuccess: (session) => {
              setCurrentSession(session);
              setSaveModalOpen(false);
            },
            onError,
          }
        );
      }
    },
    [createAuth, updateSession, inputs, currentSession]
  );

  const handleLoadScenario = useCallback(
    (session: ProfitModelSession) => {
      setInputs(session.inputs);
      setCurrentSession(session);
    },
    [setInputs]
  );

  // Reset to engine defaults. Confirms first since the persisted scenario
  // (and the in-memory edits the user has made since hydration) are blown away.
  const handleReset = useCallback(() => {
    Alert.alert(
      "Reset to defaults?",
      "Your current scenario will be cleared.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            void clearPersistedScenario();
            setInputs(defaults);
            setCurrentSession(null);
          },
        },
      ]
    );
  }, [setInputs]);

  // PM-6 stretch (P3) — pre-fill from real franchise data. Requires a new
  // backend endpoint that synthesizes inputs from the franchise's last 12
  // months of P&L. Tracked separately so this PR isn't blocked on it.
  // TODO(PM-6 follow-up): Add `GET /api/v1/tools/profit-model/prefill-from-franchise`
  // returning `ProfitModelInputs`, then surface a "Pre-fill from my last 12
  // months" button next to the Save row for authenticated users.

  const isSaving =
    createAuth.isPending || updateSession.isPending;

  if (!hydrated || !result) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading calculator…</Text>
      </View>
    );
  }

  const fixedCostsBars = inputs.fixed_costs.map((c) => ({
    label: c.name,
    value: c.monthly_amount * 12,
  }));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      {isAuthenticated ? (
        <View style={styles.actionRow}>
          <Pressable
            style={styles.actionBtn}
            onPress={handleAuthenticatedSavePress}
            hitSlop={8}
          >
            <MaterialIcons name="bookmark-add" size={18} color="#3B82F6" />
            <Text style={styles.actionBtnText}>
              {currentSession && !currentSession.is_anonymous
                ? "Save changes"
                : "Save to my account"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => setScenariosOpen(true)}
            hitSlop={8}
          >
            <MaterialIcons name="folder-open" size={18} color="#3B82F6" />
            <Text style={styles.actionBtnText}>My Scenarios</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={styles.saveBtn}
          onPress={handleAnonymousShare}
          hitSlop={8}
          disabled={createAnon.isPending}
        >
          <MaterialIcons name="link" size={18} color="#3B82F6" />
          <Text style={styles.saveBtnText}>
            {createAnon.isPending
              ? "Creating share link…"
              : "Save to permanent link"}
          </Text>
        </Pressable>
      )}
      {currentSession ? (
        <View style={styles.activeChip}>
          <MaterialIcons name="bookmark" size={12} color="#3B82F6" />
          <Text style={styles.activeChipText}>
            Editing: {currentSession.name ?? "Untitled"}
          </Text>
        </View>
      ) : null}

      <View style={styles.modeToggleContainer}>
        <Pressable
          style={[styles.modeButton, mode === "investor" && styles.modeButtonActive]}
          onPress={() => setMode("investor")}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === "investor" }}
          hitSlop={4}
        >
          <Text
            style={[
              styles.modeButtonText,
              mode === "investor" && styles.modeButtonTextActive,
            ]}
          >
            Investor
          </Text>
          <Text
            style={[
              styles.modeButtonSubtext,
              mode === "investor" && styles.modeButtonSubtextActive,
            ]}
          >
            Is it a good investment?
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, mode === "operator" && styles.modeButtonActive]}
          onPress={() => setMode("operator")}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === "operator" }}
          hitSlop={4}
        >
          <Text
            style={[
              styles.modeButtonText,
              mode === "operator" && styles.modeButtonTextActive,
            ]}
          >
            Operator
          </Text>
          <Text
            style={[
              styles.modeButtonSubtext,
              mode === "operator" && styles.modeButtonSubtextActive,
            ]}
          >
            Am I out of cash?
          </Text>
        </Pressable>
      </View>

      {mode === "operator" ? (
        inputs.operator_state ? (
          <>
            {/*
              PM-MIG-18 — operator-mode KPI strip. Swaps the investor tiles
              (Take-Home / EBITDA / Payback) for the three diagnostic numbers
              that actually matter when the question is "am I out of cash?".
              Each tile reads straight from the engine output — no derived
              math here so the modal's Cash Diagnostic tab and this strip
              cannot drift.
            */}
            {result.runway && result.trapped_working_capital ? (
              <>
                <View style={styles.kpiRow}>
                  <KpiTile
                    label="Runway"
                    value={
                      Number.isFinite(result.runway.runway_months)
                        ? `${result.runway.runway_months.toFixed(1)} mo`
                        : "∞"
                    }
                    sublabel={runwayStatusLabel(result.runway.status)}
                    tone={runwayTone(result.runway.status)}
                    glossaryKey={result.info_keys?.runway}
                  />
                  <KpiTile
                    label="Trapped WC"
                    value={currency(result.trapped_working_capital.net_trapped)}
                    tone={
                      result.trapped_working_capital.net_trapped > 0
                        ? "warn"
                        : "neutral"
                    }
                    glossaryKey={result.info_keys?.trapped_working_capital}
                  />
                  <KpiTile
                    label="Critical Flags"
                    value={String(criticalFlagCount(result.severity_flags))}
                    tone={
                      criticalFlagCount(result.severity_flags) > 0
                        ? "negative"
                        : "neutral"
                    }
                  />
                </View>

                <View style={styles.kpiSubRow}>
                  <Text style={styles.kpiSub}>
                    Burn {currency(result.runway.monthly_burn)}/mo · Cash{" "}
                    {currency(result.runway.cash_on_hand)}
                  </Text>
                </View>
              </>
            ) : null}

            <PeriodSection
              operatorState={inputs.operator_state}
              setOperatorField={setOperatorField}
            />
            <BalanceSheetSection
              operatorState={inputs.operator_state}
              setOperatorField={setOperatorField}
            />
            <UpcomingObligationsSection
              operatorState={inputs.operator_state}
              setOperatorField={setOperatorField}
              onObligationsChange={setObligations}
            />
            <ForecastPrefsSection
              operatorState={inputs.operator_state}
              defaultGrowthPct={inputs.annual_revenue_growth_pct}
              setOperatorField={setOperatorField}
            />

            <Pressable
              style={styles.detailsBtn}
              onPress={() => setDetailsOpen(true)}
              hitSlop={8}
            >
              <Text style={styles.detailsText}>View cash diagnostic</Text>
              <MaterialIcons name="arrow-forward" size={18} color="#3B82F6" />
            </Pressable>
          </>
        ) : null
      ) : (
        <>
      <View style={styles.kpiRow}>
        <KpiTile
          label="Monthly Take-Home"
          value={currency(result.kpis.monthly_owner_take_home)}
          tone={result.kpis.monthly_owner_take_home >= 0 ? "primary" : "negative"}
          glossaryKey={result.info_keys.kpis.monthly_owner_take_home}
        />
        <KpiTile
          label="Annual EBITDA"
          value={currency(result.kpis.annual_ebitda_post_franchise)}
          sublabel={percent(result.kpis.ebitda_margin_pct, 1) + " margin"}
          tone={result.kpis.annual_ebitda_post_franchise >= 0 ? "neutral" : "negative"}
          glossaryKey={result.info_keys.kpis.annual_ebitda_post_franchise}
        />
        <KpiTile
          label="Payback"
          value={
            result.kpis.payback_period_months !== null
              ? months_to_human(result.kpis.payback_period_months)
              : "—"
          }
          sublabel={
            result.kpis.irr_pct !== null
              ? percent(result.kpis.irr_pct, 0) + " 5y IRR"
              : undefined
          }
          tone="warn"
          glossaryKey={result.info_keys.kpis.payback_period_months}
        />
      </View>

      <View style={styles.kpiSubRow}>
        <Text style={styles.kpiSub}>
          {currency(result.kpis.annual_net_sales)} net sales · {result.kpis.days_worked_per_year} days/yr
        </Text>
      </View>

      {result.warnings && result.warnings.length > 0 ? (
        <View style={styles.warningsContainer}>
          {result.warnings.map((w, i) => (
            <Text
              key={i}
              style={[
                styles.warningText,
                w.level === "error"
                  ? styles.warningError
                  : w.level === "warn"
                    ? styles.warningWarn
                    : styles.warningInfo,
              ]}
            >
              {w.field ? `${w.field}: ` : ""}
              {w.message}
            </Text>
          ))}
        </View>
      ) : null}

      <Accordion
        title="Investment Setup"
        subtitle={`${currency(result.investment.total_initial_investment)} total`}
        defaultOpen
      >
        <CurrencyInput
          label="Truck cost (each)"
          value={inputs.capex.truck_cost_each}
          max={500_000}
          onChange={(v) =>
            update({ capex: { ...inputs.capex, truck_cost_each: v } })
          }
        />
        <NumberInput
          label="Truck useful life (years)"
          value={inputs.capex.truck_useful_life_years}
          min={1}
          max={15}
          onChange={(v) =>
            update({ capex: { ...inputs.capex, truck_useful_life_years: v } })
          }
        />
        <CurrencyInput
          label="Additional buildout (tools, fitout)"
          value={inputs.capex.additional_buildout}
          max={500_000}
          onChange={(v) =>
            update({ capex: { ...inputs.capex, additional_buildout: v } })
          }
        />
        <CurrencyInput
          label="Franchise fee (upfront)"
          value={inputs.capex.franchise_fee_upfront}
          max={250_000}
          onChange={(v) =>
            update({ capex: { ...inputs.capex, franchise_fee_upfront: v } })
          }
        />
        <CurrencyInput
          label="Territory fee"
          value={inputs.capex.territory_fee}
          max={500_000}
          onChange={(v) => update({ capex: { ...inputs.capex, territory_fee: v } })}
        />
        <CurrencyInput
          label="Working capital"
          value={inputs.capex.working_capital}
          max={250_000}
          onChange={(v) =>
            update({ capex: { ...inputs.capex, working_capital: v } })
          }
          glossaryKey="working_capital"
        />

        <SegmentedToggle
          label="Financing"
          value={inputs.capex.financing.mode}
          options={[
            { value: "loan", label: "Loan" },
            { value: "cash", label: "Cash" },
          ]}
          onChange={(mode) =>
            update({
              capex: {
                ...inputs.capex,
                financing: { ...inputs.capex.financing, mode },
              },
            })
          }
        />
        {inputs.capex.financing.mode === "loan" ? (
          <>
            <PercentInput
              label="Down payment %"
              value={inputs.capex.financing.down_payment_pct}
              max={100}
              onChange={(v) =>
                update({
                  capex: {
                    ...inputs.capex,
                    financing: { ...inputs.capex.financing, down_payment_pct: v },
                  },
                })
              }
            />
            <NumberInput
              label="Loan term (years)"
              value={inputs.capex.financing.loan_term_years}
              min={1}
              max={30}
              onChange={(v) =>
                update({
                  capex: {
                    ...inputs.capex,
                    financing: { ...inputs.capex.financing, loan_term_years: v },
                  },
                })
              }
            />
            <PercentInput
              label="Loan APR"
              value={inputs.capex.financing.loan_apr}
              max={25}
              onChange={(v) =>
                update({
                  capex: {
                    ...inputs.capex,
                    financing: { ...inputs.capex.financing, loan_apr: v },
                  },
                })
              }
            />
          </>
        ) : null}

        <NumberInput
          label="Months to full capacity"
          value={inputs.ramp.months_to_full_capacity}
          min={0}
          max={24}
          onChange={(v) =>
            update({ ramp: { ...inputs.ramp, months_to_full_capacity: v } })
          }
        />
        <PercentInput
          label="Starting capacity %"
          value={inputs.ramp.starting_capacity_pct}
          max={100}
          onChange={(v) =>
            update({ ramp: { ...inputs.ramp, starting_capacity_pct: v } })
          }
        />
      </Accordion>

      <Accordion
        title="Revenue"
        subtitle={`${inputs.services.length} services · ${inputs.addons.length} add-ons`}
        defaultOpen
      >
        <Text style={styles.subhead}>Service lines</Text>
        <DynamicList
          items={inputs.services}
          minItems={1}
          addLabel="Add service"
          onAdd={addService}
          onRemove={removeService}
          renderItem={(svc) => (
            <View style={styles.serviceCard}>
              <Text style={styles.serviceTitle}>{svc.name}</Text>
              <View style={styles.gridRow}>
                <View style={styles.gridCell}>
                  <NumberInput
                    label="Trucks"
                    value={svc.trucks}
                    min={0}
                    max={20}
                    onChange={(v) => updateService(svc.id, { trucks: v })}
                  />
                </View>
                <View style={styles.gridCell}>
                  <NumberInput
                    label="Jobs/day/truck"
                    value={svc.jobs_per_day_per_truck}
                    min={0}
                    max={50}
                    onChange={(v) =>
                      updateService(svc.id, { jobs_per_day_per_truck: v })
                    }
                  />
                </View>
              </View>
              <View style={styles.gridRow}>
                <View style={styles.gridCell}>
                  <CurrencyInput
                    label="Price (each)"
                    value={svc.flat_price ?? 0}
                    onChange={(v) => updateService(svc.id, { flat_price: v })}
                  />
                </View>
                <View style={styles.gridCell}>
                  <CurrencyInput
                    label="COGS (each)"
                    value={svc.flat_cogs ?? 0}
                    onChange={(v) => updateService(svc.id, { flat_cogs: v })}
                  />
                </View>
              </View>
            </View>
          )}
        />

        <View style={styles.divider} />
        <Text style={styles.subhead}>Pricing adjustments</Text>
        <PercentInput
          label="Tips % of revenue"
          value={inputs.tips_pct_of_revenue}
          max={30}
          onChange={(v) => update({ tips_pct_of_revenue: v })}
        />
        <PercentInput
          label="Discount % of revenue"
          value={inputs.discount_pct_of_revenue}
          max={50}
          onChange={(v) => update({ discount_pct_of_revenue: v })}
        />
        <PercentInput
          label="Sales tax % (display only)"
          value={inputs.sales_tax_pct}
          max={15}
          onChange={(v) => update({ sales_tax_pct: v })}
        />

        <View style={styles.divider} />
        <NumberInput
          label="Weeks per year"
          value={inputs.weeks_per_year}
          min={1}
          max={52}
          onChange={(v) => update({ weeks_per_year: v })}
        />
        <NumberInput
          label="Days per week"
          value={inputs.days_per_week}
          min={1}
          max={7}
          onChange={(v) => update({ days_per_week: v })}
        />
      </Accordion>

      <Accordion
        title="Operating Costs"
        subtitle={`${inputs.employees.length} employees · ${inputs.fixed_costs.length} fixed lines`}
      >
        <Text style={styles.subhead}>Employees</Text>
        <DynamicList
          items={inputs.employees}
          addLabel="Add employee"
          emptyHint="No employees yet (you're solo)."
          onAdd={addEmployee}
          onRemove={removeEmployee}
          renderItem={(emp) => (
            <View style={styles.serviceCard}>
              <Text style={styles.serviceTitle}>{emp.name}</Text>
              <CurrencyInput
                label="Annual salary"
                value={emp.annual_salary}
                onChange={(v) => updateEmployee(emp.id, { annual_salary: v })}
              />
            </View>
          )}
        />

        <PercentInput
          label="Payroll tax %"
          value={inputs.payroll_tax_pct}
          max={20}
          onChange={(v) => update({ payroll_tax_pct: v })}
        />
        <PercentInput
          label="Workers' comp %"
          value={inputs.workers_comp_pct}
          max={10}
          onChange={(v) => update({ workers_comp_pct: v })}
        />
        <CurrencyInput
          label="Health benefits / mo / employee"
          value={inputs.health_benefits_monthly_per_employee}
          max={2000}
          onChange={(v) => update({ health_benefits_monthly_per_employee: v })}
        />
        <CurrencyInput
          label="Payroll processing / mo (flat)"
          value={inputs.payroll_processing_monthly_flat}
          max={500}
          onChange={(v) => update({ payroll_processing_monthly_flat: v })}
        />

        <View style={styles.divider} />
        <Text style={styles.subhead}>Owner compensation</Text>
        <SegmentedToggle
          value={inputs.owner_compensation_mode}
          options={[
            { value: "distributions", label: "Distributions" },
            { value: "wages_in_payroll", label: "On payroll" },
          ]}
          onChange={(v) => update({ owner_compensation_mode: v })}
        />
        <Text style={styles.modeHint}>
          {inputs.owner_compensation_mode === "wages_in_payroll"
            ? "You pay yourself a W-2 salary. Add yourself to Employees above with role=owner."
            : "You take draws below the line. Set draw amounts below."}
        </Text>
        {inputs.owner_compensation_mode === "distributions" ? (
          <>
            <CurrencyInput
              label="Annual draw"
              value={inputs.owner_distributions.annual_draw}
              onChange={(v) =>
                update({
                  owner_distributions: {
                    ...inputs.owner_distributions,
                    annual_draw: v,
                  },
                })
              }
            />
            <CurrencyInput
              label="Health insurance / mo"
              value={inputs.owner_distributions.health_insurance_monthly}
              onChange={(v) =>
                update({
                  owner_distributions: {
                    ...inputs.owner_distributions,
                    health_insurance_monthly: v,
                  },
                })
              }
            />
            <CurrencyInput
              label="Auto payment / mo"
              value={inputs.owner_distributions.auto_payment_monthly}
              onChange={(v) =>
                update({
                  owner_distributions: {
                    ...inputs.owner_distributions,
                    auto_payment_monthly: v,
                  },
                })
              }
            />
            <CurrencyInput
              label="Other / mo"
              value={inputs.owner_distributions.other_monthly}
              onChange={(v) =>
                update({
                  owner_distributions: {
                    ...inputs.owner_distributions,
                    other_monthly: v,
                  },
                })
              }
            />
          </>
        ) : null}

        <View style={styles.divider} />
        <Text style={styles.subhead}>Fixed costs (monthly)</Text>
        <DynamicList
          items={inputs.fixed_costs}
          addLabel="Add fixed cost"
          onAdd={addFixedCost}
          onRemove={removeFixedCost}
          renderItem={(fc) => (
            <View style={styles.serviceCard}>
              <Text style={styles.serviceTitle}>{fc.name}</Text>
              <View style={styles.gridRow}>
                <View style={styles.gridCell}>
                  <CurrencyInput
                    label="Monthly amount"
                    value={fc.monthly_amount}
                    onChange={(v) =>
                      updateFixedCost(fc.id, { monthly_amount: v })
                    }
                  />
                </View>
                <View style={styles.gridCell}>
                  <PercentInput
                    label="Growth/yr %"
                    value={fc.growth_pct_per_year}
                    max={25}
                    onChange={(v) =>
                      updateFixedCost(fc.id, { growth_pct_per_year: v })
                    }
                  />
                </View>
              </View>
            </View>
          )}
        />
      </Accordion>

      <Accordion
        title="Franchise Terms"
        subtitle={`${percent(inputs.royalty_pct_of_net_sales, 1)} royalty`}
      >
        <PercentInput
          label="Royalty % of net sales"
          value={inputs.royalty_pct_of_net_sales}
          max={15}
          onChange={(v) => update({ royalty_pct_of_net_sales: v })}
          glossaryKey="royalty"
        />
        <PercentInput
          label="Ad fund % of net sales"
          value={inputs.ad_fund_pct_of_net_sales}
          max={5}
          onChange={(v) => update({ ad_fund_pct_of_net_sales: v })}
          glossaryKey="ad_fund"
        />
        <CurrencyInput
          label="Technology fee / mo"
          value={inputs.technology_fee_monthly}
          max={2000}
          onChange={(v) => update({ technology_fee_monthly: v })}
        />
        <CurrencyInput
          label="Other franchise fees / mo"
          value={inputs.other_franchise_fees_monthly}
          max={2000}
          onChange={(v) => update({ other_franchise_fees_monthly: v })}
        />
      </Accordion>

      <Accordion title="Goals" subtitle={`${currency(inputs.annual_profit_goal)}/yr`}>
        <CurrencyInput
          label="Annual profit goal"
          value={inputs.annual_profit_goal}
          max={10_000_000}
          onChange={(v) => update({ annual_profit_goal: v })}
        />
        <SegmentedToggle
          label="Goal metric"
          value={inputs.profit_definition}
          options={[
            { value: "OwnerTakeHome", label: "Take-Home" },
            { value: "EBITDA", label: "EBITDA" },
            { value: "NetIncome", label: "Net Income" },
          ]}
          onChange={(v) => update({ profit_definition: v })}
        />
      </Accordion>

      <Accordion
        title="Multi-Year & Roll-Up"
        subtitle={`${inputs.years_to_project} yr · ${percent(inputs.annual_revenue_growth_pct, 1)} growth`}
      >
        <NumberInput
          label="Years to project"
          value={inputs.years_to_project}
          min={1}
          max={10}
          onChange={(v) => update({ years_to_project: v })}
        />
        <PercentInput
          label="Annual revenue growth %"
          value={inputs.annual_revenue_growth_pct}
          min={-25}
          max={50}
          onChange={(v) => update({ annual_revenue_growth_pct: v })}
        />

        <View style={styles.divider} />
        <SegmentedToggle
          label="City roll-up"
          value={inputs.city.enabled ? "on" : "off"}
          options={[
            { value: "off", label: "Off" },
            { value: "on", label: "On" },
          ]}
          onChange={(v) =>
            update({ city: { ...inputs.city, enabled: v === "on" } })
          }
        />
        {inputs.city.enabled ? (
          <>
            <NumberInput
              label="Territories in city"
              value={inputs.city.territories}
              min={1}
              max={50}
              onChange={(v) =>
                update({ city: { ...inputs.city, territories: v } })
              }
            />
            <CurrencyInput
              label="Shared overhead / yr"
              value={inputs.city.shared_overhead_annual}
              max={1_000_000}
              onChange={(v) =>
                update({ city: { ...inputs.city, shared_overhead_annual: v } })
              }
            />
          </>
        ) : null}
      </Accordion>

      <Accordion title="Advanced" subtitle="Other income · amortization">
        <CurrencyInput
          label="Interest income / yr"
          value={inputs.cfo.interest_income_annual}
          max={100_000}
          onChange={(v) =>
            update({ cfo: { ...inputs.cfo, interest_income_annual: v } })
          }
        />
        <CurrencyInput
          label="Other income / yr"
          value={inputs.cfo.other_income_annual}
          max={500_000}
          onChange={(v) =>
            update({ cfo: { ...inputs.cfo, other_income_annual: v } })
          }
        />
        <CurrencyInput
          label="Amortization / yr"
          value={inputs.cfo.amortization_annual}
          max={100_000}
          onChange={(v) =>
            update({ cfo: { ...inputs.cfo, amortization_annual: v } })
          }
        />
      </Accordion>

      <Pressable
        style={styles.detailsBtn}
        onPress={() => setDetailsOpen(true)}
        hitSlop={8}
      >
        <Text style={styles.detailsText}>View detailed results</Text>
        <MaterialIcons name="arrow-forward" size={18} color="#3B82F6" />
      </Pressable>
        </>
      )}

      <View style={styles.footerActions}>
        <Pressable
          style={styles.resetBtn}
          onPress={handleReset}
          hitSlop={8}
        >
          <MaterialIcons name="refresh" size={16} color="#EF4444" />
          <Text style={styles.resetText}>Reset</Text>
        </Pressable>
        <Pressable
          style={styles.cancelBtn}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Text style={styles.cancelText}>Close calculator</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>
        Net sales = service revenue minus discounts (excludes tips & sales tax). EBITDA is before
        interest, depreciation, amortization, and owner expenses. Net income is after.
      </Text>

      <DetailedResultsModal
        visible={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        result={result}
        fixedCostsBars={fixedCostsBars}
        mode={mode}
        onGlossaryPress={handleGlossaryPress}
      />

      {glossaryEntry ? (
        <GlossarySheet entry={glossaryEntry} onClose={closeGlossary} />
      ) : null}

      <SaveScenarioModal
        visible={saveModalOpen}
        initialName={currentSession?.name ?? null}
        isUpdate={!!(currentSession && !currentSession.is_anonymous)}
        isSaving={isSaving}
        onSave={handleSaveSubmit}
        onClose={() => setSaveModalOpen(false)}
      />

      <ScenariosModal
        visible={scenariosOpen}
        onClose={() => setScenariosOpen(false)}
        onLoad={handleLoadScenario}
      />

      <ShareLinkModal
        visible={shareModal.visible}
        shareUrl={shareModal.url}
        expiresAt={shareModal.expiresAt}
        onClose={() => setShareModal((s) => ({ ...s, visible: false }))}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  scroll: { padding: 12, paddingBottom: 48 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  loadingText: { color: "#6B7280", fontSize: 14 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    marginBottom: 10,
  },
  saveBtnText: { color: "#3B82F6", fontWeight: "700", fontSize: 13 },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  actionBtnText: { color: "#3B82F6", fontWeight: "700", fontSize: 13 },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    marginBottom: 10,
  },
  activeChipText: { color: "#3B82F6", fontSize: 11, fontWeight: "600" },
  modeToggleContainer: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 4,
    gap: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  modeButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "transparent",
    minHeight: 56,
  },
  modeButtonActive: {
    backgroundColor: "#3B82F6",
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  modeButtonTextActive: {
    color: "#fff",
  },
  modeButtonSubtext: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
    fontWeight: "500",
  },
  modeButtonSubtextActive: {
    color: "#DBEAFE",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  kpiSubRow: {
    alignItems: "center",
    marginBottom: 12,
  },
  kpiSub: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "500",
  },
  subhead: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  modeHint: {
    fontSize: 12,
    color: "#6B7280",
    fontStyle: "italic",
    marginTop: -4,
  },
  serviceCard: {
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 10,
    gap: 10,
  },
  row: { flexDirection: "row", alignItems: "center" },
  serviceTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  gridRow: {
    flexDirection: "row",
    gap: 10,
  },
  gridCell: { flex: 1 },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 6,
  },
  detailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  detailsText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#3B82F6",
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 6,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  resetText: {
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "600",
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "600",
  },
  warningsContainer: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    gap: 4,
  },
  warningText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  warningError: { color: "#EF4444" },
  warningWarn: { color: "#D97706" },
  warningInfo: { color: "#3B82F6" },
  footer: {
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 24,
    lineHeight: 16,
    paddingHorizontal: 12,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  errorScroll: {
    padding: 20,
    paddingBottom: 48,
  },
  errorBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
    marginBottom: 12,
  },
  errorBadgeText: {
    color: "#B91C1C",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    marginBottom: 16,
  },
  errorMessageBox: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorMessageLabel: {
    fontSize: 11,
    color: "#B91C1C",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  errorMessageText: {
    fontSize: 13,
    color: "#374151",
    fontFamily: "Menlo",
  },
  errorStackBox: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
  },
  errorStackLabel: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  errorStackText: {
    fontSize: 11,
    color: "#6B7280",
    fontFamily: "Menlo",
    lineHeight: 16,
  },
  errorPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#3B82F6",
    marginBottom: 10,
  },
  errorPrimaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  errorSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFF",
  },
  errorSecondaryBtnText: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "600",
  },
});

// Wraps the screen so a render-time crash inside the calculator (most often
// from a stale persisted scenario whose shape predates an engine resync) shows
// a recoverable error card instead of taking the whole RN root down. The
// "Reset calculator" path clears SecureStore and remounts the inner screen,
// which is the actual fix for the most common cause.
function ProfitCalculatorErrorFallback({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();

  const handleReset = useCallback(async () => {
    await clearPersistedScenario();
    reset();
  }, [reset]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(auth)/login");
    }
  }, [router]);

  return (
    <ScrollView
      style={styles.errorContainer}
      contentContainerStyle={styles.errorScroll}
    >
      <View style={styles.errorBadge}>
        <MaterialIcons name="error-outline" size={12} color="#B91C1C" />
        <Text style={styles.errorBadgeText}>Calculator error</Text>
      </View>
      <Text style={styles.errorTitle}>The calculator hit a snag</Text>
      <Text style={styles.errorBody}>
        Something went wrong while loading your scenario. Resetting to defaults
        almost always fixes this — your saved scenarios on your account are not
        affected.
      </Text>

      {error.message ? (
        <View style={styles.errorMessageBox}>
          <Text style={styles.errorMessageLabel}>Error</Text>
          <Text style={styles.errorMessageText}>{error.message}</Text>
        </View>
      ) : null}

      {error.stack ? (
        <View style={styles.errorStackBox}>
          <Text style={styles.errorStackLabel}>Details</Text>
          <Text style={styles.errorStackText} numberOfLines={20}>
            {error.stack}
          </Text>
        </View>
      ) : null}

      <Pressable style={styles.errorPrimaryBtn} onPress={handleReset} hitSlop={8}>
        <MaterialIcons name="refresh" size={18} color="#fff" />
        <Text style={styles.errorPrimaryBtnText}>Reset calculator data</Text>
      </Pressable>
      <Pressable style={styles.errorSecondaryBtn} onPress={handleBack} hitSlop={8}>
        <MaterialIcons name="arrow-back" size={18} color="#374151" />
        <Text style={styles.errorSecondaryBtnText}>Go back</Text>
      </Pressable>
    </ScrollView>
  );
}

export default function ProfitCalculatorScreen() {
  return (
    <ErrorBoundary fallback={ProfitCalculatorErrorFallback}>
      <ProfitCalculatorScreenInner />
    </ErrorBoundary>
  );
}
