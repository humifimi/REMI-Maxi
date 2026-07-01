// Part of the REMI profit-model engine.
// Default + named scenarios from spec §10.
// See /Users/jacegalloway/Documents/Docs/docs/pdf-implementation-plans/plans/profit-model-v2-spec.md.

import type { ProfitModelInputs } from './types';

// §10.1 fixed-cost preset:
//   Spec §10.1 lists 8 lines summing to $9,200/mo (with `software` at $2,000/mo
//   per §4.9 — the real base REMI franchise systems fee). The preset matches
//   the spec exactly: 8 lines × 12 = $110,400/yr.
//
//   A 9th $100/mo "Office / Misc" line previously lived here as a
//   reconciliation hack against the pre-recalibration spec ($500 software,
//   asserted $93,600/yr fixed). The 2026-04 software bump ($500 → $2,000)
//   made that hack unnecessary; removing it lets every §10.1 expected output
//   line up with the spec's headline numbers without a $1,200/yr offset.

/** §10.1 — Single-truck baseline. The shipping default scenario. */
export const defaults: ProfitModelInputs = {
  weeks_per_year: 52,
  days_per_week: 5,

  annual_profit_goal: 200_000,
  profit_definition: 'OwnerTakeHome',

  services: [
    {
      id: 'oil',
      name: 'Oil Change',
      trucks: 1,
      jobs_per_day_per_truck: 8,
      pricing_mode: 'flat',
      flat_price: 90,
      flat_cogs: 25,
    },
    {
      id: 'tire',
      name: 'Tire',
      trucks: 1,
      jobs_per_day_per_truck: 2,
      pricing_mode: 'flat',
      flat_price: 180,
      flat_cogs: 120,
    },
    {
      id: 'brake',
      name: 'Brake',
      trucks: 1,
      jobs_per_day_per_truck: 1,
      pricing_mode: 'flat',
      flat_price: 450,
      flat_cogs: 180,
    },
    {
      id: 'battery',
      name: 'Battery',
      trucks: 1,
      jobs_per_day_per_truck: 1,
      pricing_mode: 'flat',
      flat_price: 240,
      flat_cogs: 120,
    },
  ],

  addons: [],

  tips_pct_of_revenue: 0,
  discount_pct_of_revenue: 0,

  sales_tax_pct: 8,

  employees: [],
  payroll_tax_pct: 8,
  workers_comp_pct: 3,
  health_benefits_monthly_per_employee: 0,
  payroll_processing_monthly_flat: 0,

  owner_compensation_mode: 'distributions',
  owner_distributions: {
    annual_draw: 0,
    health_insurance_monthly: 0,
    auto_payment_monthly: 0,
    other_monthly: 0,
  },

  fixed_costs: [
    { id: 'rent', name: 'Rent', monthly_amount: 2500, growth_pct_per_year: 3 },
    { id: 'gas', name: 'Gas / Fuel', monthly_amount: 1500, growth_pct_per_year: 5 },
    { id: 'phone', name: 'Cell Phone', monthly_amount: 150, growth_pct_per_year: 0 },
    { id: 'utility', name: 'Utilities', monthly_amount: 300, growth_pct_per_year: 3 },
    { id: 'binsur', name: 'Business Insurance', monthly_amount: 350, growth_pct_per_year: 3 },
    { id: 'vinsur', name: 'Vehicle Insurance', monthly_amount: 400, growth_pct_per_year: 3 },
    { id: 'software', name: 'Software / Tools', monthly_amount: 2000, growth_pct_per_year: 3 },
    { id: 'mkt', name: 'Marketing', monthly_amount: 2000, growth_pct_per_year: 3 },
  ],

  royalty_pct_of_net_sales: 7,
  ad_fund_pct_of_net_sales: 0,
  technology_fee_monthly: 0,
  other_franchise_fees_monthly: 0,

  // No capex / cash financing so §10.1 expected outputs (which intentionally
  // exclude depreciation + interest) match the year-1 P&L directly.
  capex: {
    truck_cost_each: 0,
    truck_useful_life_years: 7,
    additional_buildout: 0,
    franchise_fee_upfront: 0,
    territory_fee: 0,
    working_capital: 0,
    financing: {
      mode: 'cash',
      down_payment_pct: 100,
      loan_term_years: 7,
      loan_apr: 9.5,
    },
  },

  // No ramp so year 1 == steady state for §10.1 expected outputs.
  ramp: {
    months_to_full_capacity: 0,
    starting_capacity_pct: 100,
  },

  years_to_project: 5,
  annual_revenue_growth_pct: 5,

  city: {
    enabled: false,
    name: '',
    territories: 1,
    shared_overhead_annual: 0,
  },

  cfo: {
    interest_income_annual: 0,
    other_income_annual: 0,
    amortization_annual: 0,
  },
};

/** Deep-clone a preset so callers can mutate without poisoning the shared default. */
function cloneInputs(src: ProfitModelInputs): ProfitModelInputs {
  return JSON.parse(JSON.stringify(src)) as ProfitModelInputs;
}

/** §10.1 — Same as `defaults`, exported under a friendly name for demos/tests. */
const singleTruckBaseline: ProfitModelInputs = cloneInputs(defaults);

/** §10.2 — Baseline + a single $50k tech. Used for the labor-formula calibration test. */
const singleTruckWithEmployee: ProfitModelInputs = (() => {
  const p = cloneInputs(defaults);
  p.employees = [
    { id: 'e1', name: 'Tech 1', annual_salary: 50_000, role: 'tech' },
  ];
  return p;
})();

/** §10.3 — Adds CapEx, financing, ramp, and 5-year projection on top of §10.2. */
const fullInvestmentScenario: ProfitModelInputs = (() => {
  const p = cloneInputs(singleTruckWithEmployee);
  p.capex = {
    truck_cost_each: 75_000,
    truck_useful_life_years: 7,
    additional_buildout: 25_000,
    franchise_fee_upfront: 50_000,
    territory_fee: 0,
    working_capital: 25_000,
    financing: {
      mode: 'loan',
      down_payment_pct: 25,
      loan_term_years: 7,
      loan_apr: 9.5,
    },
  };
  p.ramp = {
    months_to_full_capacity: 6,
    starting_capacity_pct: 25,
  };
  p.years_to_project = 5;
  p.annual_revenue_growth_pct = 5;
  return p;
})();

/** Named scenarios; clone before mutating to avoid cross-test pollution. */
export const presets = {
  singleTruckBaseline,
  singleTruckWithEmployee,
  fullInvestmentScenario,
} as const;
