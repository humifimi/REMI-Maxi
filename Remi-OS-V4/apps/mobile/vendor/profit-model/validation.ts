// Part of the REMI profit-model engine.
// Bounds + warnings per spec §4 (input contract) and §6.9 (warnings shape).
// See /Users/jacegalloway/Documents/Docs/docs/pdf-implementation-plans/plans/profit-model-v2-spec.md.

import type {
  Addon,
  CapEx,
  CityRollup,
  Employee,
  FixedCostLine,
  ProfitModelInputs,
  PriceTier,
  Ramp,
  ServiceLine,
  ValidationWarning,
} from './types';

// Re-export the warning shape so callers can `import { ValidationWarning } from './validation'`
// (matches the §6.9 interface verbatim and used by route validators).
export type { ValidationWarning } from './types';

interface NumericBound {
  /** Dotted/bracketed path used in the warning. */
  field: string;
  /** Inclusive minimum. */
  min: number;
  /** Inclusive maximum. */
  max: number;
}

const TOP_LEVEL_BOUNDS: NumericBound[] = [
  { field: 'weeks_per_year', min: 1, max: 52 },
  { field: 'days_per_week', min: 1, max: 7 },
  { field: 'annual_profit_goal', min: 0, max: 10_000_000 },
  { field: 'tips_pct_of_revenue', min: 0, max: 30 },
  { field: 'discount_pct_of_revenue', min: 0, max: 50 },
  { field: 'sales_tax_pct', min: 0, max: 15 },
  { field: 'payroll_tax_pct', min: 0, max: 20 },
  { field: 'workers_comp_pct', min: 0, max: 10 },
  { field: 'health_benefits_monthly_per_employee', min: 0, max: 2000 },
  { field: 'payroll_processing_monthly_flat', min: 0, max: 500 },
  { field: 'royalty_pct_of_net_sales', min: 0, max: 15 },
  { field: 'ad_fund_pct_of_net_sales', min: 0, max: 5 },
  { field: 'technology_fee_monthly', min: 0, max: 2000 },
  { field: 'other_franchise_fees_monthly', min: 0, max: 2000 },
  { field: 'years_to_project', min: 1, max: 10 },
  { field: 'annual_revenue_growth_pct', min: -25, max: 50 },
];

const CAPEX_BOUNDS: NumericBound[] = [
  { field: 'capex.truck_cost_each', min: 0, max: 500_000 },
  { field: 'capex.truck_useful_life_years', min: 1, max: 15 },
  { field: 'capex.additional_buildout', min: 0, max: 500_000 },
  { field: 'capex.franchise_fee_upfront', min: 0, max: 250_000 },
  { field: 'capex.territory_fee', min: 0, max: 500_000 },
  { field: 'capex.working_capital', min: 0, max: 250_000 },
  { field: 'capex.financing.down_payment_pct', min: 0, max: 100 },
  { field: 'capex.financing.loan_term_years', min: 1, max: 30 },
  { field: 'capex.financing.loan_apr', min: 0, max: 25 },
];

const RAMP_BOUNDS: NumericBound[] = [
  { field: 'ramp.months_to_full_capacity', min: 0, max: 24 },
  { field: 'ramp.starting_capacity_pct', min: 0, max: 100 },
];

const CITY_BOUNDS: NumericBound[] = [
  { field: 'city.territories', min: 1, max: 50 },
  { field: 'city.shared_overhead_annual', min: 0, max: 1_000_000 },
];

const CFO_BOUNDS: NumericBound[] = [
  { field: 'cfo.interest_income_annual', min: 0, max: 100_000 },
  { field: 'cfo.other_income_annual', min: 0, max: 500_000 },
  { field: 'cfo.amortization_annual', min: 0, max: 100_000 },
];

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function getNumeric(obj: unknown, dottedPath: string): number {
  // Resolve a path like "capex.financing.loan_apr" by splitting and walking.
  const parts = dottedPath.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return Number.NaN;
    }
  }
  return typeof cur === 'number' ? cur : Number.NaN;
}

function checkBounds(
  obj: unknown,
  bounds: NumericBound[],
  warnings: ValidationWarning[],
): void {
  for (const b of bounds) {
    const v = getNumeric(obj, b.field);
    if (Number.isNaN(v)) continue;
    if (v < b.min || v > b.max) {
      warnings.push({
        level: 'warn',
        field: b.field,
        message: `${b.field} = ${v} is outside [${b.min}, ${b.max}] and will be clamped.`,
      });
    }
  }
}

/** §6.9 — Collect every warning the engine can derive from inputs. Never throws. */
export function validateInputs(inputs: ProfitModelInputs): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  checkBounds(inputs, TOP_LEVEL_BOUNDS, warnings);
  checkBounds(inputs, CAPEX_BOUNDS, warnings);
  checkBounds(inputs, RAMP_BOUNDS, warnings);
  checkBounds(inputs, CITY_BOUNDS, warnings);
  checkBounds(inputs, CFO_BOUNDS, warnings);

  // §4.3 services
  inputs.services.forEach((s, i) => {
    if (s.trucks < 0 || s.trucks > 20) {
      warnings.push({
        level: 'warn',
        field: `services[${i}].trucks`,
        message: `services[${i}].trucks = ${s.trucks} is outside [0, 20] and will be clamped.`,
      });
    }
    if (s.jobs_per_day_per_truck < 0 || s.jobs_per_day_per_truck > 50) {
      warnings.push({
        level: 'warn',
        field: `services[${i}].jobs_per_day_per_truck`,
        message: `services[${i}].jobs_per_day_per_truck = ${s.jobs_per_day_per_truck} is outside [0, 50] and will be clamped.`,
      });
    }

    // §6.9 — error: trucks must be ≥ 1 if jobs/day > 0
    if (s.trucks <= 0 && s.jobs_per_day_per_truck > 0) {
      warnings.push({
        level: 'error',
        field: `services[${i}].trucks`,
        message: `Number of trucks must be ≥ 1 if jobs per day > 0 (service "${s.name}").`,
      });
    }

    // §5.2 — tier % normalization warning
    if (s.pricing_mode === 'tiered' && s.tiers && s.tiers.length > 0) {
      const total = s.tiers.reduce((acc, t) => acc + (t.pct_of_jobs ?? 0), 0);
      if (Math.abs(total - 100) > 0.01) {
        warnings.push({
          level: 'warn',
          field: `services[${i}].tiers`,
          message: `Tier percentages sum to ${total}%, normalized to 100% for the calculation.`,
        });
      }
      s.tiers.forEach((t, ti) => {
        if (t.pct_of_jobs < 0 || t.pct_of_jobs > 100) {
          warnings.push({
            level: 'warn',
            field: `services[${i}].tiers[${ti}].pct_of_jobs`,
            message: `services[${i}].tiers[${ti}].pct_of_jobs = ${t.pct_of_jobs} is outside [0, 100] and will be clamped.`,
          });
        }
      });
    }
  });

  // §4.9 fixed costs
  inputs.fixed_costs.forEach((f, i) => {
    if (f.growth_pct_per_year < 0 || f.growth_pct_per_year > 25) {
      warnings.push({
        level: 'warn',
        field: `fixed_costs[${i}].growth_pct_per_year`,
        message: `fixed_costs[${i}].growth_pct_per_year = ${f.growth_pct_per_year} is outside [0, 25] and will be clamped.`,
      });
    }
    if (f.monthly_amount < 0) {
      warnings.push({
        level: 'warn',
        field: `fixed_costs[${i}].monthly_amount`,
        message: `fixed_costs[${i}].monthly_amount = ${f.monthly_amount} is negative and will be clamped to 0.`,
      });
    }
  });

  // §4.8 owner mode conflict
  const distroSum =
    inputs.owner_distributions.annual_draw +
    inputs.owner_distributions.health_insurance_monthly * 12 +
    inputs.owner_distributions.auto_payment_monthly * 12 +
    inputs.owner_distributions.other_monthly * 12;
  const ownerOnPayroll = inputs.employees.some((e) => e.role === 'owner');
  if (inputs.owner_compensation_mode === 'wages_in_payroll' && distroSum > 0) {
    warnings.push({
      level: 'warn',
      field: 'owner_distributions',
      message:
        'Owner is on payroll AND distributions are entered — distributions ignored.',
    });
  }
  if (inputs.owner_compensation_mode === 'distributions' && ownerOnPayroll) {
    warnings.push({
      level: 'warn',
      field: 'employees',
      message:
        "Owner has role='owner' on payroll but compensation mode is 'distributions' — owner wages will still be counted in labor.",
    });
  }

  // §4.13 aggressive growth info warning
  if (inputs.annual_revenue_growth_pct > 25) {
    warnings.push({
      level: 'info',
      field: 'annual_revenue_growth_pct',
      message: `Annual revenue growth ${inputs.annual_revenue_growth_pct}% is aggressive — sense-check against industry data.`,
    });
  }

  // §4.16 operator-mode requirements
  if (inputs.mode === 'operator' && !inputs.operator_state) {
    warnings.push({
      level: 'error',
      field: 'operator_state',
      message:
        "Operator mode requires `operator_state`. Provide at minimum `period`, `balance_sheet_light.cash_on_hand`, and `upcoming_obligations: []`.",
    });
  }
  if (inputs.mode === 'operator' && inputs.operator_state) {
    const cash = inputs.operator_state.balance_sheet_light?.cash_on_hand;
    if (cash === undefined || cash < 0) {
      warnings.push({
        level: 'error',
        field: 'operator_state.balance_sheet_light.cash_on_hand',
        message: 'Cash on hand is required for operator mode and must be ≥ 0.',
      });
    }
  }

  return warnings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clamping — produce a safe-to-compute copy of the inputs
// ─────────────────────────────────────────────────────────────────────────────

function clampService(s: ServiceLine): ServiceLine {
  const out: ServiceLine = {
    ...s,
    trucks: clamp(s.trucks, 0, 20),
    jobs_per_day_per_truck: clamp(s.jobs_per_day_per_truck, 0, 50),
    flat_price: s.flat_price !== undefined ? Math.max(0, s.flat_price) : s.flat_price,
    flat_cogs: s.flat_cogs !== undefined ? Math.max(0, s.flat_cogs) : s.flat_cogs,
  };
  if (s.tiers) {
    out.tiers = s.tiers.map(
      (t): PriceTier => ({
        ...t,
        price: Math.max(0, t.price),
        cogs: Math.max(0, t.cogs),
        pct_of_jobs: clamp(t.pct_of_jobs, 0, 100),
      }),
    );
  }
  return out;
}

function clampAddon(a: Addon): Addon {
  return {
    ...a,
    monthly_units: Math.max(0, Math.floor(a.monthly_units)),
    revenue_per_unit: Math.max(0, a.revenue_per_unit),
    cogs_per_unit: Math.max(0, a.cogs_per_unit),
  };
}

function clampEmployee(e: Employee): Employee {
  return { ...e, annual_salary: Math.max(0, e.annual_salary) };
}

function clampFixedCost(f: FixedCostLine): FixedCostLine {
  return {
    ...f,
    monthly_amount: Math.max(0, f.monthly_amount),
    growth_pct_per_year: clamp(f.growth_pct_per_year, 0, 25),
  };
}

function clampCapEx(c: CapEx): CapEx {
  return {
    truck_cost_each: clamp(c.truck_cost_each, 0, 500_000),
    truck_useful_life_years: clamp(c.truck_useful_life_years, 1, 15),
    additional_buildout: clamp(c.additional_buildout, 0, 500_000),
    franchise_fee_upfront: clamp(c.franchise_fee_upfront, 0, 250_000),
    territory_fee: clamp(c.territory_fee, 0, 500_000),
    working_capital: clamp(c.working_capital, 0, 250_000),
    financing: {
      mode: c.financing.mode,
      down_payment_pct: clamp(c.financing.down_payment_pct, 0, 100),
      loan_term_years: clamp(c.financing.loan_term_years, 1, 30),
      loan_apr: clamp(c.financing.loan_apr, 0, 25),
    },
  };
}

function clampRamp(r: Ramp): Ramp {
  return {
    months_to_full_capacity: clamp(r.months_to_full_capacity, 0, 24),
    starting_capacity_pct: clamp(r.starting_capacity_pct, 0, 100),
  };
}

function clampCity(c: CityRollup): CityRollup {
  return {
    ...c,
    territories: clamp(c.territories, 1, 50),
    shared_overhead_annual: clamp(c.shared_overhead_annual, 0, 1_000_000),
  };
}

/**
 * Returns a NEW inputs object with every numeric field clamped to its §4 bound.
 * Used internally by `calculate()` so output is never undefined for bad input.
 *
 * `mode`, `operator_state`, `provenance`, and `data_sources` are passed through
 * unchanged — they're either present and valid or absent. Their internal
 * structures aren't consumed by the engine in v3, so clamping is unnecessary.
 */
export function clampInputs(inputs: ProfitModelInputs): ProfitModelInputs {
  return {
    mode: inputs.mode,
    weeks_per_year: clamp(inputs.weeks_per_year, 1, 52),
    days_per_week: clamp(inputs.days_per_week, 1, 7),

    annual_profit_goal: clamp(inputs.annual_profit_goal, 0, 10_000_000),
    profit_definition: inputs.profit_definition,

    services: inputs.services.map(clampService),
    addons: inputs.addons.map(clampAddon),

    tips_pct_of_revenue: clamp(inputs.tips_pct_of_revenue, 0, 30),
    discount_pct_of_revenue: clamp(inputs.discount_pct_of_revenue, 0, 50),

    sales_tax_pct: clamp(inputs.sales_tax_pct, 0, 15),

    employees: inputs.employees.map(clampEmployee),
    payroll_tax_pct: clamp(inputs.payroll_tax_pct, 0, 20),
    workers_comp_pct: clamp(inputs.workers_comp_pct, 0, 10),
    health_benefits_monthly_per_employee: clamp(
      inputs.health_benefits_monthly_per_employee,
      0,
      2000,
    ),
    payroll_processing_monthly_flat: clamp(
      inputs.payroll_processing_monthly_flat,
      0,
      500,
    ),

    owner_compensation_mode: inputs.owner_compensation_mode,
    owner_distributions: {
      annual_draw: Math.max(0, inputs.owner_distributions.annual_draw),
      health_insurance_monthly: Math.max(
        0,
        inputs.owner_distributions.health_insurance_monthly,
      ),
      auto_payment_monthly: Math.max(
        0,
        inputs.owner_distributions.auto_payment_monthly,
      ),
      other_monthly: Math.max(0, inputs.owner_distributions.other_monthly),
    },

    fixed_costs: inputs.fixed_costs.map(clampFixedCost),

    royalty_pct_of_net_sales: clamp(inputs.royalty_pct_of_net_sales, 0, 15),
    ad_fund_pct_of_net_sales: clamp(inputs.ad_fund_pct_of_net_sales, 0, 5),
    technology_fee_monthly: clamp(inputs.technology_fee_monthly, 0, 2000),
    other_franchise_fees_monthly: clamp(
      inputs.other_franchise_fees_monthly,
      0,
      2000,
    ),

    capex: clampCapEx(inputs.capex),
    ramp: clampRamp(inputs.ramp),

    years_to_project: clamp(inputs.years_to_project, 1, 10),
    annual_revenue_growth_pct: clamp(inputs.annual_revenue_growth_pct, -25, 50),

    city: clampCity(inputs.city),

    cfo: {
      interest_income_annual: clamp(inputs.cfo.interest_income_annual, 0, 100_000),
      other_income_annual: clamp(inputs.cfo.other_income_annual, 0, 500_000),
      amortization_annual: clamp(inputs.cfo.amortization_annual, 0, 100_000),
    },

    operator_state: inputs.operator_state,
    provenance: inputs.provenance,
    data_sources: inputs.data_sources,
  };
}
