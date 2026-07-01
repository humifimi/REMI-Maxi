// Part of the REMI profit-model engine.
// See /Users/jacegalloway/Documents/Docs/docs/pdf-implementation-plans/plans/profit-model-v2-spec.md
// for the full input (§4) and output (§6) contracts.

// ─────────────────────────────────────────────────────────────────────────────
// §4 — Input Contract
// ─────────────────────────────────────────────────────────────────────────────

/** §4.3 — Single tier of a tiered pricing line. `pct_of_jobs` is a 0–100 share. */
export interface PriceTier {
  /** Stable identifier (uuid or similar). */
  id: string;
  /** Display label, e.g. "Standard Oil", "Synthetic". */
  name: string;
  /** Customer-facing price for this tier. */
  price: number;
  /** Cost of goods sold for this tier. */
  cogs: number;
  /** Share of jobs in this tier (0–100). v2 normalizes if total ≠ 100. */
  pct_of_jobs: number;
}

/** §4.3 — A single revenue-generating service line. Replaces v1's hardcoded four lines. */
export interface ServiceLine {
  /** Stable identifier. */
  id: string;
  /** Display name, e.g. "Oil Change". */
  name: string;
  /** Number of trucks dedicated to this line. Bound: 0–20. */
  trucks: number;
  /** Steady-state jobs per day per truck. Bound: 0–50. */
  jobs_per_day_per_truck: number;
  /** Pricing model — flat per-job or weighted average across tiers. */
  pricing_mode: 'flat' | 'tiered';
  /** Used when `pricing_mode === 'flat'`. */
  flat_price?: number;
  /** Used when `pricing_mode === 'flat'`. */
  flat_cogs?: number;
  /** Used when `pricing_mode === 'tiered'`. */
  tiers?: PriceTier[];
}

/** §4.4 — Add-on revenue items priced per unit per month. */
export interface Addon {
  id: string;
  name: string;
  /** Whole units sold per month. */
  monthly_units: number;
  revenue_per_unit: number;
  cogs_per_unit: number;
}

/** §4.7 — Single payroll record. Owner is included here when mode='wages_in_payroll'. */
export interface Employee {
  id: string;
  name: string;
  annual_salary: number;
  role: 'tech' | 'ops' | 'admin' | 'manager' | 'owner';
}

/** §4.9 — A single fixed monthly cost line with its own growth rate. */
export interface FixedCostLine {
  id: string;
  /** Display name, e.g. "Rent". */
  name: string;
  /** Monthly amount in USD. */
  monthly_amount: number;
  /** Per-line annual growth (compounded each year of the projection). Bound: 0–25. */
  growth_pct_per_year: number;
  /** Optional grouping label for the breakdown UI. */
  category?: 'facility' | 'vehicle' | 'admin' | 'professional' | 'other';
}

/** §4.8 — Owner draws taken below the line when mode='distributions'. */
export interface OwnerDistributions {
  annual_draw: number;
  health_insurance_monthly: number;
  auto_payment_monthly: number;
  other_monthly: number;
}

/** §4.11 — Financing terms for the upfront investment. */
export interface Financing {
  /** 'cash' = no loan; 'loan' = SBA/term loan with the params below. */
  mode: 'cash' | 'loan';
  /** Operator's cash-down portion as a percent of total_initial_investment. Bound: 0–100. */
  down_payment_pct: number;
  /** Loan term. Bound: 1–30. */
  loan_term_years: number;
  /** Annual percentage rate on the loan. Bound: 0–25. */
  loan_apr: number;
}

/** §4.11 — Capital expenditure & financing block. */
export interface CapEx {
  /** Per-truck cost. Total truck cost = trucks × this. Bound: 0–500_000. */
  truck_cost_each: number;
  /** Truck depreciation horizon in years. Bound: 1–15. */
  truck_useful_life_years: number;
  /** Tools, shop fitout, computer equipment. Bound: 0–500_000. */
  additional_buildout: number;
  /** Initial franchise fee paid upfront. Bound: 0–250_000. */
  franchise_fee_upfront: number;
  /** Optional territory development fee. Bound: 0–500_000. */
  territory_fee: number;
  /** Cash buffer for the first 3–6 months. Bound: 0–250_000. */
  working_capital: number;
  financing: Financing;
}

/** §4.12 — Linear ramp from `starting_capacity_pct` to 100% over `months_to_full_capacity`. */
export interface Ramp {
  /** Months until the territory is at full steady-state capacity. Bound: 0–24. */
  months_to_full_capacity: number;
  /** Capacity in month 1 as a percent of full. Bound: 0–100. */
  starting_capacity_pct: number;
}

/** §4.14 — Optional roll-up across multiple territories in one city. */
export interface CityRollup {
  enabled: boolean;
  name: string;
  /** Number of territories to multiply by. Bound: 1–50. */
  territories: number;
  /** City-level shared overhead deducted at city net-income. Bound: 0–1_000_000. */
  shared_overhead_annual: number;
}

/** §4.15 — Advanced CFO inputs. Depreciation and interest are auto-derived elsewhere. */
export interface CFO {
  /** Bound: 0–100_000. */
  interest_income_annual: number;
  /** Bound: 0–500_000. */
  other_income_annual: number;
  /** Non-trademark intangibles only. Bound: 0–100_000. */
  amortization_annual: number;
}

/**
 * §4.0 Provenance & Data Sources — supports future external integrations
 * (Plaid, QuickBooks Online, Xero, Stripe, Square, Gusto, Rippling, ADP).
 *
 * v3 engine: types are present on the input contract but the engine does not
 * use them. Phase 5 wires real data sources. Until then `provider: 'manual'`
 * is the implicit default and provenance is undefined.
 */
export type DataSourceProvider =
  | 'manual'
  | 'plaid'
  | 'quickbooks_online'
  | 'xero'
  | 'stripe'
  | 'square'
  | 'gusto'
  | 'rippling'
  | 'adp';

export interface DataSourceConnection {
  /** Stable connection id, namespaced by provider. e.g. 'plaid:item:abc123'. */
  id: string;
  provider: DataSourceProvider;
  /** Human-readable label, e.g. "Chase Business Checking ••1234" */
  label: string;
  /** ISO timestamp of last successful sync. Undefined for never-synced. */
  last_synced_at?: string;
  /** Provider-specific status. Free-form so v3 doesn't have to model every provider. */
  status?: 'active' | 'requires_reauth' | 'error' | 'disconnected';
}

export interface FieldProvenance {
  /** Which connection sourced this field's current value. */
  connection_id?: string;
  provider: DataSourceProvider;
  /** ISO timestamp of when the value last came from the source. */
  observed_at?: string;
  /** True if the operator manually overrode the source value. */
  overridden?: boolean;
  /** Optional note when overridden. */
  override_reason?: string;
}

/** §4 — The full input contract for `calculate()`. */
export interface ProfitModelInputs {
  /**
   * §1 dual purpose. 'investor' = greenfield projection (default).
   * 'operator' = current-state cash diagnostic. Engine emits different output
   * branches based on this. Defaults to 'investor' if undefined.
   */
  mode?: 'investor' | 'operator';

  /** §4.1 — Bound: 1–52. */
  weeks_per_year: number;
  /** §4.1 — Bound: 1–7. */
  days_per_week: number;

  /** §4.2 — Annual profit goal in USD. Bound: 0–10_000_000. */
  annual_profit_goal: number;
  /** §4.2 — Which output the goal is measured against. */
  profit_definition: 'EBITDA' | 'NetIncome' | 'OwnerTakeHome';

  /** §4.3 — Dynamic list of revenue-generating service lines. */
  services: ServiceLine[];
  /** §4.4 — Dynamic list of add-on items. */
  addons: Addon[];

  /** §4.5 — % of (service + addon) revenue collected as tips. Bound: 0–30. */
  tips_pct_of_revenue: number;
  /** §4.5 — % off per ticket. Bound: 0–50. */
  discount_pct_of_revenue: number;

  /** §4.6 — Display-only pass-through. Never enters P&L. Bound: 0–15. */
  sales_tax_pct: number;

  /** §4.7 — Employees on payroll. */
  employees: Employee[];
  /** §4.7 — Combined employer-side FICA + FUTA + SUTA. Bound: 0–20. */
  payroll_tax_pct: number;
  /** §4.7 — Workers' compensation insurance. Bound: 0–10. */
  workers_comp_pct: number;
  /** §4.7 — Bound: 0–2000. */
  health_benefits_monthly_per_employee: number;
  /** §4.7 — Per-territory flat fee (Gusto / Rippling), NOT per-employee. Bound: 0–500. */
  payroll_processing_monthly_flat: number;

  /** §4.8 — How the owner takes compensation (mutually exclusive). */
  owner_compensation_mode: 'wages_in_payroll' | 'distributions';
  /** §4.8 — Used when mode='distributions'. */
  owner_distributions: OwnerDistributions;

  /** §4.9 — Dynamic fixed cost lines. */
  fixed_costs: FixedCostLine[];

  /** §4.10 — Royalty rate. Bound: 0–15. */
  royalty_pct_of_net_sales: number;
  /** §4.10 — National/regional ad fund. Bound: 0–5. */
  ad_fund_pct_of_net_sales: number;
  /** §4.10 — Bound: 0–2000. */
  technology_fee_monthly: number;
  /** §4.10 — Bound: 0–2000. */
  other_franchise_fees_monthly: number;

  /** §4.11 — CapEx and financing. */
  capex: CapEx;

  /** §4.12 — Year-1 ramp shape. */
  ramp: Ramp;

  /** §4.13 — Number of years in the multi-year projection. Bound: 1–10. */
  years_to_project: number;
  /** §4.13 — Annual revenue growth applied year 2+. Bound: -25 to 50. */
  annual_revenue_growth_pct: number;

  /** §4.14 — Optional city-level roll-up. */
  city: CityRollup;

  /** §4.15 — Advanced CFO inputs. */
  cfo: CFO;

  /** §4.16 — required when mode === 'operator', undefined otherwise. */
  operator_state?: OperatorState;

  /**
   * §4.0 Provenance map — keyed by JSON path into ProfitModelInputs.
   * Examples:
   *   "services[0].flat_price"      → bank-derived price
   *   "fixed_costs[3].monthly_amount" → QBO-derived rent
   *   "operator_state.balance_sheet_light.cash_on_hand" → Plaid balance
   * Engine ignores this map in v3; UI displays source badges based on it.
   */
  provenance?: Record<string, FieldProvenance>;

  /**
   * Optional list of connected data source instances. UI uses this to render
   * the Connected Sources panel (Phase 5). Engine ignores in v3.
   */
  data_sources?: DataSourceConnection[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 — Output Contract
// ─────────────────────────────────────────────────────────────────────────────

/** §6.9 — A single validation result surfaced from `validateInputs()` / `calculate()`. */
export interface ValidationWarning {
  level: 'info' | 'warn' | 'error';
  /** Optional dotted/bracketed input path, e.g. 'services[0].tiers'. */
  field?: string;
  message: string;
}

/** §6.1 — Top-line KPIs (year 1, post-ramp where applicable). */
export interface ProfitModelKPIs {
  monthly_owner_take_home: number;
  annual_net_sales: number;
  annual_ebitda_post_franchise: number;
  ebitda_margin_pct: number;
  payback_period_months: number | null;
  irr_pct: number | null;
  /** Demoted from headline KPI to footer note. */
  days_worked_per_year: number;
}

/** §6.2 — Itemized franchise-fee breakdown. */
export interface FranchiseFeesBreakdown {
  royalty: number;
  ad_fund: number;
  tech_fee: number;
  other: number;
  total: number;
}

/** §6.2 — Annual P&L summary (year 1). */
export interface ProfitModelPnL {
  /** Includes addons + tips per §5.4. */
  service_revenue: number;
  discounts: number;
  net_sales: number;
  cogs_total: number;
  labor_total: number;
  fixed_costs_total: number;
  ebitda_pre_franchise: number;
  franchise_fees: FranchiseFeesBreakdown;
  ebitda_post_franchise: number;
  depreciation: number;
  interest_expense: number;
  amortization: number;
  other_income: number;
  interest_income: number;
  owner_below_line_draws: number;
  net_income: number;
  owner_take_home_cash: number;
  principal_payments: number;
}

/** §6.3 — Per-line monthly mix row. Battery is rendered like every other line. */
export interface ServiceMixRow {
  service_id: string;
  name: string;
  monthly_jobs: number;
  monthly_revenue: number;
  monthly_cogs: number;
  monthly_gross_profit: number;
}

/** §6.4 — Cash deposited vs. business revenue (sales-tax pass-through made explicit). */
export interface CashCollected {
  service_revenue: number;
  addon_revenue: number;
  tips: number;
  /** Negative or zero. */
  discounts: number;
  net_sales: number;
  sales_tax_collected: number;
  /** What's deposited (net_sales + sales_tax + tips). */
  total_cash_collected: number;
  /** Equal to sales_tax_collected; remitted next period. */
  sales_tax_remitted: number;
  /** What stays after tax remittance (== net_sales). */
  net_business_revenue: number;
}

/** §6.5 — Per-service marginal-truck answer row. */
export interface MarginalTruckROIRow {
  service_id: string;
  service_name: string;
  incremental_annual_ebitda: number;
  /** Null if EBITDA from a new truck is non-positive (never pays back). */
  payback_years: number | null;
  roi_year_1_pct: number;
}

/** §6.5 — Investment summary covering everything an investor wants to see. */
export interface InvestmentSummary {
  total_initial_investment: number;
  /** Down payment + working capital + closing fees. */
  cash_required_at_close: number;
  loan_principal: number;
  monthly_loan_payment: number;
  payback_period_months: number | null;
  irr_5yr_pct: number | null;
  cumulative_cash_by_year: Array<{ year: number; cumulative: number }>;
  marginal_truck_roi: MarginalTruckROIRow[];
}

/** §6.6 — Per-year row of the projection table. */
export interface ProjectionRow {
  year: number;
  net_sales: number;
  ebitda_pre_franchise: number;
  ebitda_post_franchise: number;
  net_income: number;
  owner_take_home_cash: number;
  cumulative_cash: number;
  /** Capacity factor for this year (1.0 after ramp; <1 during ramp year). */
  capacity_factor_pct: number;
}

/** §6.7 — Single point on a multi-year chart. */
export interface ChartPoint {
  year: number;
  value: number;
}

/** §6.7 — All chart series share the same Y-axis range so Net Sales isn't truncated. */
export interface ChartSeries {
  net_sales: ChartPoint[];
  ebitda: ChartPoint[];
  net_income: ChartPoint[];
  cumulative_cash: ChartPoint[];
}

/** §6.8 — Goal progress vs the chosen profit metric. */
export interface GoalProgress {
  goal_amount: number;
  goal_metric: 'EBITDA' | 'NetIncome' | 'OwnerTakeHome';
  current_amount: number;
  /** Negative if achieved. */
  gap: number;
  /** Clamped to [-2, 2] for chart safety. */
  progress_pct: number;
  /** gap / 12. */
  monthly_delta: number;
  status: 'achieved' | 'short' | 'losing';
  message: string;
}

/** §5.17 — Optional city roll-up block, present when `inputs.city.enabled`. */
export interface CityRollupOutput {
  city_name: string;
  territories: number;
  city_net_sales: number;
  city_ebitda_pre_franchise: number;
  city_franchise_fees: number;
  city_ebitda_post_franchise: number;
  city_net_income: number;
  city_take_home: number;
  shared_overhead_annual: number;
}

/** §5.18 — Franchisor profit summary (territory exit + 5-year fee revenue). */
export interface FranchisorProfit {
  suggested_exit_values: Array<{ multiple: number; value: number }>;
  total_5yr_royalty: number;
  total_5yr_ad_fund: number;
  total_5yr_tech_fee: number;
  franchisor_profit_5yr: number;
}

/**
 * §6.10 — Glossary annotations for output fields.
 *
 * Keyed by output block, then by the field name within that block. Values
 * are stable glossary keys consumed by `<InfoIcon glossaryKey="..." />` on
 * the frontend (see `glossary.ts`). The map is purely declarative — the
 * engine never derives values from it, so it is safe for frontends to
 * cache it as a constant.
 *
 * Operator-mode block annotations are top-level keys (`cash_bridge`,
 * `runway`, etc.) rather than per-field maps because the whole block has
 * a single explainer in the UI.
 */
export interface OutputInfoKeys {
  kpis: Partial<Record<keyof ProfitModelKPIs, string>>;
  pnl: Partial<Record<keyof ProfitModelPnL, string>>;
  investment: Partial<Record<keyof InvestmentSummary, string>>;
  cash_bridge?: string;
  trapped_working_capital?: string;
  runway?: string;
  ninety_day_cash_position?: string;
  thirteen_week_forecast?: string;
}

/** §6 — Top-level output object returned by `calculate()`. */
export interface ProfitModelOutputs {
  kpis: ProfitModelKPIs;
  pnl: ProfitModelPnL;
  service_mix: ServiceMixRow[];
  cash_collected: CashCollected;
  investment: InvestmentSummary;
  projection: ProjectionRow[];
  chart_series: ChartSeries;
  goal: GoalProgress;
  warnings: ValidationWarning[];
  /** §6.10 — declarative glossary key map for annotated output fields. */
  info_keys: OutputInfoKeys;
  /** §5.17 — present only when `inputs.city.enabled === true`. */
  city_rollup?: CityRollupOutput;
  /** §5.18 — exit-multiple suggestions and 5-year franchisor fee totals. */
  franchisor: FranchisorProfit;
  /** §5.20 — present only when mode === 'operator'. */
  cash_bridge?: CashBridge;
  /** §5.21 — present only when mode === 'operator'. */
  trapped_working_capital?: TrappedWorkingCapital;
  /** §5.22 — present only when mode === 'operator'. */
  runway?: RunwayAnalysis;
  /** §5.23 — present only when mode === 'operator'. */
  ninety_day_cash_position?: NinetyDayCashPosition;
  /** §5.24 — present only when mode === 'operator'. */
  thirteen_week_forecast?: ThirteenWeekForecast;
  /** §5.25 — present only when mode === 'operator'. */
  severity_flags?: SeverityFlag[];
}

// ─────────────────────────────────────────────────────────────
// §4.16 Operator State — current snapshot for cash diagnostic
// ─────────────────────────────────────────────────────────────

export interface UpcomingObligation {
  id: string;
  /** Display label e.g. "Q1 sales tax", "Loan payment", "Owner draw" */
  name: string;
  amount: number;
  /** ISO date (YYYY-MM-DD) when payable. */
  due_date: string;
  /** Bucket for grouping in UI / severity logic. */
  category: 'sales_tax' | 'loan' | 'payroll' | 'owner_draw' | 'rent' | 'utility' | 'cogs' | 'other';
}

export interface OperatorBalanceSheetLight {
  cash_on_hand: number;
}

export interface OperatorBalanceSheetMedium {
  accounts_receivable: number;
  accounts_payable: number;
  inventory_value: number;
}

export interface OperatorBalanceSheetHeavy {
  prepaid_expenses: number;
  accrued_expenses: number;
  credit_card_balance: number;
  line_of_credit_drawn: number;
  line_of_credit_limit: number;
  other_current_assets: number;
  other_current_liabilities: number;
}

export interface OperatorState {
  /** Reporting period the balance sheet snapshot represents. */
  period: {
    /** ISO YYYY-MM-DD inclusive. */
    start_date: string;
    end_date: string;
    /** Period actuals — annualized by engine to compare with investor projections. */
    net_sales: number;
    cogs_total: number;
    labor_total: number;
    fixed_costs_total: number;
  };
  /** Required minimum tier — every operator-mode submission has at least cash on hand. */
  balance_sheet_light: OperatorBalanceSheetLight;
  /** Optional progressive disclosure tier 2. */
  balance_sheet_medium?: OperatorBalanceSheetMedium;
  /** Optional progressive disclosure tier 3. */
  balance_sheet_heavy?: OperatorBalanceSheetHeavy;
  upcoming_obligations: UpcomingObligation[];
  forecast: {
    /** Window length for the cash forecast — 90 day default, 13-week alternative. */
    horizon: '90_days' | '13_weeks';
    /** Optional revenue growth assumption used in forecast (defaults to inputs.annual_revenue_growth_pct). */
    revenue_growth_pct_override?: number;
  };
}

// ─────────────────────────────────────────────────────────────
// §4.17 Period actuals + compliance shared types
// ─────────────────────────────────────────────────────────────

export interface SubmissionMetadata {
  submitted_at?: string;
  submitted_by_user_id?: string;
  /** Cryptographic signature or hash for audit trail (provider-specific). */
  signature?: string;
  review_status?: 'draft' | 'submitted' | 'approved' | 'rejected' | 'amendment_pending';
  reviewer_user_id?: string;
  reviewed_at?: string;
  reviewer_notes?: string;
}

export interface PeriodActuals {
  id: string;
  franchise_id: string;
  /** Optional territory id for multi-unit operators. */
  territory_id?: string;
  period: {
    start_date: string;
    end_date: string;
    cadence: 'monthly' | 'quarterly' | 'annual';
  };
  /** Same shape as OperatorState for engine reuse — operator mode and compliance share this struct. */
  balance_sheet_light: OperatorBalanceSheetLight;
  balance_sheet_medium?: OperatorBalanceSheetMedium;
  balance_sheet_heavy?: OperatorBalanceSheetHeavy;
  pnl: {
    net_sales: number;
    cogs_total: number;
    labor_total: number;
    fixed_costs_total: number;
    royalty_paid: number;
    ad_fund_paid: number;
    other_franchise_fees_paid: number;
    sales_tax_collected: number;
    sales_tax_remitted: number;
  };
  metadata: SubmissionMetadata;
  /** Same provenance map shape as ProfitModelInputs. */
  provenance?: Record<string, FieldProvenance>;
}

export interface FranchisorCompliancePolicy {
  id: string;
  franchisor_id: string;
  /** CFO defaults for reporting cadence. */
  default_cadence: 'monthly' | 'quarterly' | 'annual';
  /** Sales tax handling — 'data' = collect numbers only; 'remind' = also send due-date reminders. */
  sales_tax_role: 'data' | 'remind' | 'data_plus_remind';
  /** Royalty true-up timing. */
  royalty_truesup: 'monthly' | 'monthly_estimated_quarterly_trueup' | 'quarterly';
  /** When operators may amend a submitted period. */
  amendment_policy: 'free_until_close' | 'request_approval' | 'no_amendments';
  /** Audit trail retention horizon. */
  audit_retention_years: number;
  /** Per-franchise overrides keyed by franchise_id. */
  overrides?: Record<string, Partial<Omit<FranchisorCompliancePolicy, 'id' | 'franchisor_id' | 'overrides'>>>;
}

// ─────────────────────────────────────────────────────────────
// §5.20–§5.22 Operator-mode output blocks (cash diagnostic)
// ─────────────────────────────────────────────────────────────

/** §5.20 — EBITDA → ending-cash bridge for the operator's reported period. */
export interface CashBridge {
  starting_cash: number;
  ebitda_period: number;
  non_cash_addbacks: {
    depreciation: number;
    amortization: number;
  };
  working_capital_changes: {
    ar_delta: number;
    inventory_delta: number;
    prepaid_delta: number;
    ap_delta: number;
    net: number;
  };
  financing_outflows: {
    loan_principal: number;
    loan_interest: number;
    owner_draws: number;
  };
  tax_outflows: {
    sales_tax_remitted: number;
    income_tax_estimated: number;
  };
  ending_cash_calculated: number;
  /** Reported by operator (from balance_sheet_light.cash_on_hand). */
  ending_cash_reported: number;
  /** ending_cash_calculated - ending_cash_reported. Non-zero = unexplained drift. */
  reconciliation_diff: number;
}

/** §5.21 — Working capital tied up in AR + inventory + prepaids, net of AP. */
export interface TrappedWorkingCapital {
  accounts_receivable: number;
  inventory_value: number;
  prepaid_expenses: number;
  accounts_payable_offset: number;
  net_trapped: number;
}

/** §5.22 — Runway months at current burn, with bucketed status. */
export interface RunwayAnalysis {
  monthly_burn: number;
  cash_on_hand: number;
  runway_months: number;
  status: 'healthy' | 'caution' | 'warning' | 'critical';
}

/** §5.23 — 90-day cash position summary. */
export interface NinetyDayCashPosition {
  starting_cash: number;
  projected_inflows: number;
  projected_outflows: number;
  ending_cash: number;
  status: 'healthy' | 'caution' | 'warning' | 'critical';
}

/** §5.24 — Single week of the 13-week cash flow forecast. */
export interface ThirteenWeekForecastWeek {
  /** 0-indexed week number (0..12). */
  week_index: number;
  /** ISO YYYY-MM-DD for the Monday that opens the week. */
  week_start_date: string;
  opening_cash: number;
  inflows: number;
  outflows: number;
  ending_cash: number;
  severity: 'ok' | 'low' | 'critical';
}

/** §5.24 — 13-week cash flow forecast (always exactly 13 entries). */
export type ThirteenWeekForecast = ThirteenWeekForecastWeek[];

/** §5.25 — Severity flag emitted by the operator-mode diagnostic. */
export interface SeverityFlag {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  /** Glossary key for the explainer modal (PM-MIG-8 wires these in). */
  glossary_key?: string;
  title: string;
  message: string;
  /** Optional remediation hint shown in the UI. */
  suggested_action?: string;
}
