// Part of the REMI profit-model engine.
// Implements the formulas in spec §5 verbatim.
// See /Users/jacegalloway/Documents/Docs/docs/pdf-implementation-plans/plans/profit-model-v2-spec.md.
//
// Pure TypeScript. Zero runtime deps. Deterministic. No top-level side effects.

import type {
  CashBridge,
  CashCollected,
  ChartSeries,
  CityRollupOutput,
  Financing,
  FranchiseFeesBreakdown,
  FranchisorProfit,
  GoalProgress,
  InvestmentSummary,
  MarginalTruckROIRow,
  NinetyDayCashPosition,
  OperatorState,
  OutputInfoKeys,
  ProfitModelInputs,
  ProfitModelKPIs,
  ProfitModelOutputs,
  ProfitModelPnL,
  ProjectionRow,
  RunwayAnalysis,
  ServiceLine,
  ServiceMixRow,
  SeverityFlag,
  ThirteenWeekForecast,
  ThirteenWeekForecastWeek,
  TrappedWorkingCapital,
  FixedCostLine,
} from './types';
import { clampInputs, validateInputs } from './validation';

// ─────────────────────────────────────────────────────────────────────────────
// §6.10 — Glossary-key annotations for output fields (PM-MIG-8).
// Static; frontends look up explainer copy from `glossary.ts` using these keys.
// ─────────────────────────────────────────────────────────────────────────────

const INVESTOR_INFO_KEYS: OutputInfoKeys = {
  kpis: {
    monthly_owner_take_home: 'owner_take_home',
    annual_net_sales: 'net_sales',
    annual_ebitda_post_franchise: 'ebitda',
    ebitda_margin_pct: 'ebitda_margin',
    payback_period_months: 'payback_period',
    irr_pct: 'irr_5yr',
  },
  pnl: {
    net_sales: 'net_sales',
    cogs_total: 'cogs',
    labor_total: 'labor',
    fixed_costs_total: 'fixed_costs',
    ebitda_pre_franchise: 'ebitda',
    ebitda_post_franchise: 'ebitda',
    net_income: 'net_income',
    owner_take_home_cash: 'owner_take_home',
    owner_below_line_draws: 'owner_draws',
  },
  investment: {
    total_initial_investment: 'total_initial_investment',
    cash_required_at_close: 'cash_required_at_close',
    payback_period_months: 'payback_period',
    irr_5yr_pct: 'irr_5yr',
    marginal_truck_roi: 'marginal_truck_roi',
  },
};

const OPERATOR_INFO_KEY_BLOCKS = {
  cash_bridge: 'cash_bridge',
  trapped_working_capital: 'trapped_working_capital',
  runway: 'runway',
  ninety_day_cash_position: 'ninety_day_cash_position',
  thirteen_week_forecast: 'thirteen_week_forecast',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// §5.1 — Days per year
// ─────────────────────────────────────────────────────────────────────────────

function daysPerYear(inputs: ProfitModelInputs): number {
  return inputs.weeks_per_year * inputs.days_per_week;
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.2 — Per-service economics (with optional revenue scaling for ramp / growth)
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceEconomics {
  service_id: string;
  name: string;
  jobs_per_year: number;
  avg_price: number;
  avg_cogs: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
}

function avgPriceCogs(s: ServiceLine): { price: number; cogs: number } {
  if (s.pricing_mode === 'tiered' && s.tiers && s.tiers.length > 0) {
    const totalPct = s.tiers.reduce((a, t) => a + t.pct_of_jobs, 0);
    const norm = totalPct > 0 ? totalPct : 100;
    let price = 0;
    let cogs = 0;
    for (const t of s.tiers) {
      price += (t.price * t.pct_of_jobs) / norm;
      cogs += (t.cogs * t.pct_of_jobs) / norm;
    }
    return { price, cogs };
  }
  return { price: s.flat_price ?? 0, cogs: s.flat_cogs ?? 0 };
}

function perServiceEconomics(
  s: ServiceLine,
  days: number,
  revenueFactor: number,
): ServiceEconomics {
  const { price, cogs } = avgPriceCogs(s);
  const jobs = s.trucks * s.jobs_per_day_per_truck * days * revenueFactor;
  return {
    service_id: s.id,
    name: s.name,
    jobs_per_year: jobs,
    avg_price: price,
    avg_cogs: cogs,
    revenue: jobs * price,
    cogs: jobs * cogs,
    gross_profit: jobs * (price - cogs),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.3 — Add-ons (annual)
// ─────────────────────────────────────────────────────────────────────────────

function addonAnnual(inputs: ProfitModelInputs): { revenue: number; cogs: number } {
  let rev = 0;
  let c = 0;
  for (const a of inputs.addons) {
    rev += a.monthly_units * a.revenue_per_unit * 12;
    c += a.monthly_units * a.cogs_per_unit * 12;
  }
  return { revenue: rev, cogs: c };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.4 — Discounts, tips, net sales, sales tax
// ─────────────────────────────────────────────────────────────────────────────

interface RevenueAdjustments {
  gross_revenue_pre_discount: number;
  service_revenue_only: number;
  addon_revenue: number;
  discount_amount: number;
  tips: number;
  service_revenue_display: number;
  net_sales: number;
  sales_tax_collected: number;
  cash_collected: number;
}

function adjustments(
  inputs: ProfitModelInputs,
  serviceRevenueOnly: number,
  addonRevenue: number,
): RevenueAdjustments {
  const grossPre = serviceRevenueOnly + addonRevenue;
  const discount = grossPre * (inputs.discount_pct_of_revenue / 100);
  const tips = grossPre * (inputs.tips_pct_of_revenue / 100);
  const netSales = grossPre - discount;
  const tax = netSales * (inputs.sales_tax_pct / 100);
  return {
    gross_revenue_pre_discount: grossPre,
    service_revenue_only: serviceRevenueOnly,
    addon_revenue: addonRevenue,
    discount_amount: discount,
    tips,
    service_revenue_display: grossPre + tips,
    net_sales: netSales,
    sales_tax_collected: tax,
    cash_collected: netSales + tax + tips,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.6 — Labor (verified non-recursive)
// ─────────────────────────────────────────────────────────────────────────────

function laborTotal(inputs: ProfitModelInputs): number {
  const baseWages = inputs.employees.reduce((a, e) => a + e.annual_salary, 0);
  const employerTaxes = baseWages * (inputs.payroll_tax_pct / 100);
  const wc = baseWages * (inputs.workers_comp_pct / 100);
  const benefits =
    inputs.health_benefits_monthly_per_employee * inputs.employees.length * 12;
  const processing = inputs.payroll_processing_monthly_flat * 12;
  return baseWages + employerTaxes + wc + benefits + processing;
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.7 — Fixed costs (with optional per-line growth multipliers)
// ─────────────────────────────────────────────────────────────────────────────

function fixedCostsTotal(
  fixed: FixedCostLine[],
  multipliers: number[] | null,
): number {
  let total = 0;
  fixed.forEach((f, i) => {
    const m = multipliers ? multipliers[i] : 1;
    total += f.monthly_amount * 12 * m;
  });
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.8 — Franchise fees
// ─────────────────────────────────────────────────────────────────────────────

function franchiseFees(
  inputs: ProfitModelInputs,
  netSales: number,
): FranchiseFeesBreakdown {
  const royalty = netSales * (inputs.royalty_pct_of_net_sales / 100);
  const adFund = netSales * (inputs.ad_fund_pct_of_net_sales / 100);
  const tech = inputs.technology_fee_monthly * 12;
  const other = inputs.other_franchise_fees_monthly * 12;
  return {
    royalty,
    ad_fund: adFund,
    tech_fee: tech,
    other,
    total: royalty + adFund + tech + other,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.10 — Depreciation (auto from CapEx)
// ─────────────────────────────────────────────────────────────────────────────

function depreciation(inputs: ProfitModelInputs): number {
  const totalTrucks = inputs.services.reduce((a, s) => a + s.trucks, 0);
  const totalTruckCost = totalTrucks * inputs.capex.truck_cost_each;
  const truckLife = inputs.capex.truck_useful_life_years;
  const truckDep = truckLife > 0 ? totalTruckCost / truckLife : 0;
  // §5.10 — buildout depreciated over 7 years per IRS § 168 convention
  const buildoutDep = inputs.capex.additional_buildout / 7;
  return truckDep + buildoutDep;
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.11 — Financing → loan amortization
// ─────────────────────────────────────────────────────────────────────────────

export interface AmortizationYear {
  year: number;
  opening_balance: number;
  interest: number;
  principal: number;
  ending_balance: number;
}

export interface AmortizationResult {
  schedule: AmortizationYear[];
}

/**
 * Per-year loan amortization. Interest is summed across the 12 monthly
 * compounding periods so each year's split reflects declining balance.
 * If apr is 0, principal is split evenly across the term.
 */
export function amortizeLoan(
  principal: number,
  apr: number,
  termYears: number,
): AmortizationResult {
  const schedule: AmortizationYear[] = [];
  if (principal <= 0 || termYears <= 0) {
    return { schedule };
  }
  const monthlyApr = apr / 100 / 12;
  const n = termYears * 12;
  let monthlyPayment: number;
  if (monthlyApr === 0) {
    monthlyPayment = principal / n;
  } else {
    monthlyPayment =
      (principal * monthlyApr) / (1 - Math.pow(1 + monthlyApr, -n));
  }
  let balance = principal;
  for (let y = 1; y <= termYears; y++) {
    const opening = balance;
    let interestSum = 0;
    let principalSum = 0;
    for (let m = 0; m < 12; m++) {
      const monthInterest = balance * monthlyApr;
      const monthPrincipal = monthlyPayment - monthInterest;
      interestSum += monthInterest;
      principalSum += monthPrincipal;
      balance -= monthPrincipal;
    }
    schedule.push({
      year: y,
      opening_balance: opening,
      interest: interestSum,
      principal: principalSum,
      ending_balance: balance,
    });
  }
  return { schedule };
}

interface FinancingComputed {
  total_initial_investment: number;
  loan_principal: number;
  monthly_payment: number;
  annual_debt_service: number;
  year_1_interest_simple: number;
  year_1_principal_payment: number;
  down_payment_required: number;
  schedule: AmortizationYear[];
}

function financingComputed(inputs: ProfitModelInputs): FinancingComputed {
  const totalTrucks = inputs.services.reduce((a, s) => a + s.trucks, 0);
  const totalTruckCost = totalTrucks * inputs.capex.truck_cost_each;
  const totalInitial =
    totalTruckCost +
    inputs.capex.additional_buildout +
    inputs.capex.franchise_fee_upfront +
    inputs.capex.territory_fee +
    inputs.capex.working_capital;

  const f: Financing = inputs.capex.financing;
  if (f.mode === 'cash') {
    return {
      total_initial_investment: totalInitial,
      loan_principal: 0,
      monthly_payment: 0,
      annual_debt_service: 0,
      year_1_interest_simple: 0,
      year_1_principal_payment: 0,
      down_payment_required: totalInitial,
      schedule: [],
    };
  }

  const loanPrincipal = totalInitial * (1 - f.down_payment_pct / 100);
  const monthlyApr = f.loan_apr / 100 / 12;
  const n = f.loan_term_years * 12;
  let monthlyPayment: number;
  if (monthlyApr === 0) {
    monthlyPayment = n > 0 ? loanPrincipal / n : 0;
  } else {
    monthlyPayment =
      (loanPrincipal * monthlyApr) / (1 - Math.pow(1 + monthlyApr, -n));
  }
  const annualDebtService = monthlyPayment * 12;
  // §5.11 — year-1 interest uses APR × opening balance (simplified per spec)
  const year1InterestSimple = loanPrincipal * (f.loan_apr / 100);
  const year1Principal = annualDebtService - year1InterestSimple;
  const downPayment = totalInitial - loanPrincipal;
  const { schedule } = amortizeLoan(loanPrincipal, f.loan_apr, f.loan_term_years);
  return {
    total_initial_investment: totalInitial,
    loan_principal: loanPrincipal,
    monthly_payment: monthlyPayment,
    annual_debt_service: annualDebtService,
    year_1_interest_simple: year1InterestSimple,
    year_1_principal_payment: year1Principal,
    down_payment_required: downPayment,
    schedule,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.12 — Owner draws (below the line, only when mode='distributions')
// ─────────────────────────────────────────────────────────────────────────────

function ownerBelowLineDraws(inputs: ProfitModelInputs): number {
  if (inputs.owner_compensation_mode !== 'distributions') return 0;
  const od = inputs.owner_distributions;
  return (
    od.annual_draw +
    (od.health_insurance_monthly + od.auto_payment_monthly + od.other_monthly) *
      12
  );
}

function ownerWagesInPayroll(inputs: ProfitModelInputs): number {
  if (inputs.owner_compensation_mode !== 'wages_in_payroll') return 0;
  return inputs.employees
    .filter((e) => e.role === 'owner')
    .reduce((a, e) => a + e.annual_salary, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.12 + §5.13 — Net income and owner take-home cash
// ─────────────────────────────────────────────────────────────────────────────

function netIncomeFor(
  ebitdaPostFranchise: number,
  interestExpense: number,
  dep: number,
  amortization: number,
  interestIncome: number,
  otherIncome: number,
  ownerDraws: number,
): number {
  return (
    ebitdaPostFranchise -
    interestExpense +
    interestIncome +
    otherIncome -
    dep -
    amortization -
    ownerDraws
  );
}

function ownerTakeHomeFor(
  netIncome: number,
  dep: number,
  amortization: number,
  principalPayment: number,
  ownerWages: number,
  ownerDraws: number,
): number {
  return (
    netIncome + dep + amortization - principalPayment + ownerWages + ownerDraws
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.15 — Ramp shape for year 1
// ─────────────────────────────────────────────────────────────────────────────

function rampMonthlyFactors(inputs: ProfitModelInputs): number[] {
  const N = inputs.ramp.months_to_full_capacity;
  const start = inputs.ramp.starting_capacity_pct / 100;
  const factors: number[] = [];
  for (let m = 1; m <= 12; m++) {
    if (N <= 0) {
      factors.push(1);
      continue;
    }
    if (m >= N) {
      factors.push(1);
    } else {
      // Linear interpolation: month 1 = start, month N = 100% (achieved at month N).
      // For 1 <= m < N: factor = start + (1 - start) * (m - 1) / (N - 1) when N > 1.
      // For N == 1: month 1 already reaches 100%.
      if (N === 1) {
        factors.push(1);
      } else {
        factors.push(start + (1 - start) * ((m - 1) / (N - 1)));
      }
    }
  }
  return factors;
}

function avgRampFactor(inputs: ProfitModelInputs): number {
  const factors = rampMonthlyFactors(inputs);
  return factors.reduce((a, f) => a + f, 0) / 12;
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.15 — Per-year computation (used by both year-1 P&L and projection)
// ─────────────────────────────────────────────────────────────────────────────

interface YearComputation {
  net_sales: number;
  service_revenue_only: number;
  addon_revenue: number;
  cogs_total: number;
  labor_total: number;
  fixed_costs_total: number;
  ebitda_pre_franchise: number;
  fees: FranchiseFeesBreakdown;
  ebitda_post_franchise: number;
  depreciation: number;
  interest_expense: number;
  amortization: number;
  interest_income: number;
  other_income: number;
  owner_below_line_draws: number;
  owner_wages_in_payroll: number;
  net_income: number;
  owner_take_home_cash: number;
  principal_payment: number;
  service_economics: ServiceEconomics[];
  adjustments: RevenueAdjustments;
}

function computeYear(
  inputs: ProfitModelInputs,
  revenueFactor: number,
  fixedCostMultipliers: number[],
  interestExpense: number,
  principalPayment: number,
  dep: number,
): YearComputation {
  const days = daysPerYear(inputs);
  const economics = inputs.services.map((s) =>
    perServiceEconomics(s, days, revenueFactor),
  );
  const serviceRevenue = economics.reduce((a, e) => a + e.revenue, 0);
  const serviceCogs = economics.reduce((a, e) => a + e.cogs, 0);
  const addons = addonAnnual(inputs);
  const scaledAddonRevenue = addons.revenue * revenueFactor;
  const scaledAddonCogs = addons.cogs * revenueFactor;
  const adj = adjustments(inputs, serviceRevenue, scaledAddonRevenue);
  const cogsTotal = serviceCogs + scaledAddonCogs;
  const labor = laborTotal(inputs);
  const fixed = fixedCostsTotal(inputs.fixed_costs, fixedCostMultipliers);
  const ebitdaPre = adj.net_sales - cogsTotal - labor - fixed;
  const fees = franchiseFees(inputs, adj.net_sales);
  const ebitdaPost = ebitdaPre - fees.total;
  const ownerDraws = ownerBelowLineDraws(inputs);
  const ownerWages = ownerWagesInPayroll(inputs);
  const ni = netIncomeFor(
    ebitdaPost,
    interestExpense,
    dep,
    inputs.cfo.amortization_annual,
    inputs.cfo.interest_income_annual,
    inputs.cfo.other_income_annual,
    ownerDraws,
  );
  const oth = ownerTakeHomeFor(
    ni,
    dep,
    inputs.cfo.amortization_annual,
    principalPayment,
    ownerWages,
    ownerDraws,
  );

  return {
    net_sales: adj.net_sales,
    service_revenue_only: adj.service_revenue_only,
    addon_revenue: adj.addon_revenue,
    cogs_total: cogsTotal,
    labor_total: labor,
    fixed_costs_total: fixed,
    ebitda_pre_franchise: ebitdaPre,
    fees,
    ebitda_post_franchise: ebitdaPost,
    depreciation: dep,
    interest_expense: interestExpense,
    amortization: inputs.cfo.amortization_annual,
    interest_income: inputs.cfo.interest_income_annual,
    other_income: inputs.cfo.other_income_annual,
    owner_below_line_draws: ownerDraws,
    owner_wages_in_payroll: ownerWages,
    net_income: ni,
    owner_take_home_cash: oth,
    principal_payment: principalPayment,
    service_economics: economics,
    adjustments: adj,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.15 — Multi-year projection
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectionResult {
  rows: ProjectionRow[];
  yearly: YearComputation[];
  capacityFactorYear1: number;
}

function multiYearProjection(
  inputs: ProfitModelInputs,
  fin: FinancingComputed,
  dep: number,
): ProjectionResult {
  const rows: ProjectionRow[] = [];
  const yearly: YearComputation[] = [];
  const years = inputs.years_to_project;
  const ramp = avgRampFactor(inputs);
  let cumulative = 0;
  for (let y = 1; y <= years; y++) {
    const revenueFactor =
      y === 1 ? ramp : Math.pow(1 + inputs.annual_revenue_growth_pct / 100, y - 1);
    const fixedMult = inputs.fixed_costs.map((f) =>
      Math.pow(1 + f.growth_pct_per_year / 100, y - 1),
    );
    let interestExpense: number;
    let principalPayment: number;
    if (fin.loan_principal === 0) {
      interestExpense = 0;
      principalPayment = 0;
    } else if (y === 1) {
      // §5.11 — year 1 uses simplified opening balance × APR
      interestExpense = fin.year_1_interest_simple;
      principalPayment = fin.year_1_principal_payment;
    } else if (fin.schedule[y - 1]) {
      interestExpense = fin.schedule[y - 1].interest;
      principalPayment = fin.schedule[y - 1].principal;
    } else {
      // Past the loan term; no more debt service.
      interestExpense = 0;
      principalPayment = 0;
    }
    const yearComp = computeYear(
      inputs,
      revenueFactor,
      fixedMult,
      interestExpense,
      principalPayment,
      dep,
    );
    cumulative += yearComp.owner_take_home_cash;
    rows.push({
      year: y,
      net_sales: yearComp.net_sales,
      ebitda_pre_franchise: yearComp.ebitda_pre_franchise,
      ebitda_post_franchise: yearComp.ebitda_post_franchise,
      net_income: yearComp.net_income,
      owner_take_home_cash: yearComp.owner_take_home_cash,
      cumulative_cash: cumulative,
      capacity_factor_pct: revenueFactor,
    });
    yearly.push(yearComp);
  }
  return { rows, yearly, capacityFactorYear1: ramp };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.16 — Investment metrics: payback period, IRR, marginal truck ROI
// ─────────────────────────────────────────────────────────────────────────────

function paybackPeriodMonths(
  year0CashOut: number,
  yearlyTakeHome: number[],
): number | null {
  let cum = -year0CashOut;
  if (cum >= 0) return 0;
  for (let i = 0; i < yearlyTakeHome.length; i++) {
    const flow = yearlyTakeHome[i];
    const prev = cum;
    cum += flow;
    if (cum >= 0) {
      // Linear interpolation within this year; flow may be ≤ 0 only if cum still
      // crossed (can't happen — guarded above).
      const fraction = flow > 0 ? -prev / flow : 1;
      return i * 12 + Math.max(0, Math.min(12, fraction * 12));
    }
  }
  return null;
}

function npv(cashFlows: number[], r: number): number {
  let v = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    v += cashFlows[t] / Math.pow(1 + r, t);
  }
  return v;
}

function npvPrime(cashFlows: number[], r: number): number {
  let v = 0;
  for (let t = 1; t < cashFlows.length; t++) {
    v += (-t * cashFlows[t]) / Math.pow(1 + r, t + 1);
  }
  return v;
}

/**
 * §5.16 — Newton-Raphson IRR solver. Initial guess 10%, max 100 iters.
 * Returns null if the iteration fails to converge or the derivative collapses.
 */
function solveIRR(cashFlows: number[]): number | null {
  let r = 0.1;
  for (let iter = 0; iter < 100; iter++) {
    const v = npv(cashFlows, r);
    if (Math.abs(v) < 1e-6) return r;
    const d = npvPrime(cashFlows, r);
    if (Math.abs(d) < 1e-12) return null;
    const next = r - v / d;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - r) < 1e-9) return next;
    r = next;
    // Keep the iterate above -1 so (1 + r) stays positive.
    if (r <= -0.999) r = -0.999;
  }
  return null;
}

function marginalTruckROI(
  inputs: ProfitModelInputs,
  laborTotalAnnual: number,
): MarginalTruckROIRow[] {
  const days = daysPerYear(inputs);
  const empCount = Math.max(1, inputs.employees.length);
  const avgLaborPerEmp = laborTotalAnnual / empCount;
  const royaltyPct = inputs.royalty_pct_of_net_sales / 100;
  const adFundPct = inputs.ad_fund_pct_of_net_sales / 100;
  const truckCost = inputs.capex.truck_cost_each;
  return inputs.services.map((s) => {
    const { price, cogs } = avgPriceCogs(s);
    const incRevenue = s.jobs_per_day_per_truck * days * price;
    const incCogs = s.jobs_per_day_per_truck * days * cogs;
    const incGross = incRevenue - incCogs - avgLaborPerEmp;
    const incFranchise = incRevenue * (royaltyPct + adFundPct);
    const incEbitda = incGross - incFranchise;
    const payback =
      incEbitda > 0 && truckCost > 0 ? truckCost / incEbitda : null;
    const roiYr1 = truckCost > 0 ? (incEbitda / truckCost) * 100 : 0;
    return {
      service_id: s.id,
      service_name: s.name,
      incremental_annual_ebitda: incEbitda,
      payback_years: payback,
      roi_year_1_pct: roiYr1,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.17 — City roll-up
// ─────────────────────────────────────────────────────────────────────────────

function cityRollup(
  inputs: ProfitModelInputs,
  base: YearComputation,
): CityRollupOutput | undefined {
  if (!inputs.city.enabled) return undefined;
  const t = inputs.city.territories;
  const sh = inputs.city.shared_overhead_annual;
  return {
    city_name: inputs.city.name,
    territories: t,
    city_net_sales: base.net_sales * t,
    city_ebitda_pre_franchise: base.ebitda_pre_franchise * t,
    city_franchise_fees: base.fees.total * t,
    city_ebitda_post_franchise: base.ebitda_post_franchise * t - sh,
    city_net_income: base.net_income * t - sh,
    city_take_home: base.owner_take_home_cash * t - sh,
    shared_overhead_annual: sh,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.18 — Franchisor profit (territory exit + 5-year fees)
// ─────────────────────────────────────────────────────────────────────────────

function franchisorProfit(
  inputs: ProfitModelInputs,
  yearly: YearComputation[],
  ebitdaPostYear1: number,
): FranchisorProfit {
  // Sum royalty / ad fund / tech fee across the first up-to-5 years.
  const horizon = Math.min(5, yearly.length);
  let r = 0;
  let a = 0;
  let t = 0;
  for (let i = 0; i < horizon; i++) {
    r += yearly[i].fees.royalty;
    a += yearly[i].fees.ad_fund;
    t += yearly[i].fees.tech_fee;
  }
  return {
    suggested_exit_values: [
      { multiple: 2, value: ebitdaPostYear1 * 2 },
      { multiple: 3, value: ebitdaPostYear1 * 3 },
      { multiple: 4, value: ebitdaPostYear1 * 4 },
    ],
    total_5yr_royalty: r,
    total_5yr_ad_fund: a,
    total_5yr_tech_fee: t,
    franchisor_profit_5yr:
      inputs.capex.franchise_fee_upfront +
      inputs.capex.territory_fee +
      r +
      a +
      t,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.14 — Goal progress
// ─────────────────────────────────────────────────────────────────────────────

function buildGoal(
  inputs: ProfitModelInputs,
  ebitdaPost: number,
  netIncome: number,
  takeHome: number,
): GoalProgress {
  let current: number;
  switch (inputs.profit_definition) {
    case 'EBITDA':
      current = ebitdaPost;
      break;
    case 'NetIncome':
      current = netIncome;
      break;
    case 'OwnerTakeHome':
    default:
      current = takeHome;
      break;
  }
  const goal = inputs.annual_profit_goal;
  const gap = goal - current;
  let progress = 0;
  if (goal > 0) {
    progress = Math.max(-2, Math.min(2, current / goal));
  }
  let status: 'achieved' | 'short' | 'losing';
  if (current >= goal && goal > 0) status = 'achieved';
  else if (current >= 0) status = 'short';
  else status = 'losing';
  let message = '';
  if (status === 'achieved') {
    message = `On pace to clear the $${Math.round(goal).toLocaleString()} goal.`;
  } else if (status === 'short') {
    message = `Short of goal by $${Math.round(Math.abs(gap)).toLocaleString()} annually.`;
  } else {
    message = 'Currently operating at a loss against the chosen profit metric.';
  }
  return {
    goal_amount: goal,
    goal_metric: inputs.profit_definition,
    current_amount: current,
    gap,
    progress_pct: progress,
    monthly_delta: gap / 12,
    status,
    message,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Output assembly
// ─────────────────────────────────────────────────────────────────────────────

function assembleServiceMix(year: YearComputation): ServiceMixRow[] {
  return year.service_economics.map((e) => ({
    service_id: e.service_id,
    name: e.name,
    monthly_jobs: e.jobs_per_year / 12,
    monthly_revenue: e.revenue / 12,
    monthly_cogs: e.cogs / 12,
    monthly_gross_profit: e.gross_profit / 12,
  }));
}

function assembleCashCollected(year: YearComputation): CashCollected {
  const adj = year.adjustments;
  return {
    service_revenue: adj.service_revenue_only,
    addon_revenue: adj.addon_revenue,
    tips: adj.tips,
    discounts: -adj.discount_amount,
    net_sales: adj.net_sales,
    sales_tax_collected: adj.sales_tax_collected,
    total_cash_collected: adj.cash_collected,
    sales_tax_remitted: adj.sales_tax_collected,
    net_business_revenue: adj.net_sales,
  };
}

function assemblePnL(year: YearComputation): ProfitModelPnL {
  return {
    service_revenue: year.adjustments.service_revenue_display,
    discounts: year.adjustments.discount_amount,
    net_sales: year.net_sales,
    cogs_total: year.cogs_total,
    labor_total: year.labor_total,
    fixed_costs_total: year.fixed_costs_total,
    ebitda_pre_franchise: year.ebitda_pre_franchise,
    franchise_fees: year.fees,
    ebitda_post_franchise: year.ebitda_post_franchise,
    depreciation: year.depreciation,
    interest_expense: year.interest_expense,
    amortization: year.amortization,
    other_income: year.other_income,
    interest_income: year.interest_income,
    owner_below_line_draws: year.owner_below_line_draws,
    net_income: year.net_income,
    owner_take_home_cash: year.owner_take_home_cash,
    principal_payments: year.principal_payment,
  };
}

function assembleChartSeries(rows: ProjectionRow[]): ChartSeries {
  return {
    net_sales: rows.map((r) => ({ year: r.year, value: r.net_sales })),
    ebitda: rows.map((r) => ({ year: r.year, value: r.ebitda_post_franchise })),
    net_income: rows.map((r) => ({ year: r.year, value: r.net_income })),
    cumulative_cash: rows.map((r) => ({
      year: r.year,
      value: r.cumulative_cash,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry: calculate()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main public entry. Pure function: same inputs → same outputs.
 *
 * 1. Collect warnings against the original (unclamped) inputs.
 * 2. Clamp inputs to §4 bounds so downstream math is safe.
 * 3. Compute every output block per §5.
 */
export function calculate(rawInputs: ProfitModelInputs): ProfitModelOutputs {
  const warnings = validateInputs(rawInputs);
  const inputs = clampInputs(rawInputs);

  const fin = financingComputed(inputs);
  const dep = depreciation(inputs);

  const projection = multiYearProjection(inputs, fin, dep);
  const year1 = projection.yearly[0];

  const cumulativeCashByYear = projection.rows.map((r) => ({
    year: r.year,
    cumulative: r.cumulative_cash,
  }));

  const year0CashOut =
    fin.down_payment_required + inputs.capex.working_capital;
  const yearlyTakeHome = projection.yearly.map((y) => y.owner_take_home_cash);
  const payback = paybackPeriodMonths(year0CashOut, yearlyTakeHome);

  // §5.16 — IRR with terminal value (3× year-N EBITDA) at the final year.
  const cashFlows: number[] = [-year0CashOut, ...yearlyTakeHome];
  const lastYearComp = projection.yearly[projection.yearly.length - 1];
  if (lastYearComp) {
    const terminal = lastYearComp.ebitda_post_franchise * 3.0;
    cashFlows[cashFlows.length - 1] += terminal;
  }
  const irr = solveIRR(cashFlows);
  const irrPct = irr !== null ? irr * 100 : null;

  const monthlyTakeHome = year1.owner_take_home_cash / 12;
  const ebitdaMargin =
    year1.net_sales > 0 ? (year1.ebitda_post_franchise / year1.net_sales) * 100 : 0;

  const kpis: ProfitModelKPIs = {
    monthly_owner_take_home: monthlyTakeHome,
    annual_net_sales: year1.net_sales,
    annual_ebitda_post_franchise: year1.ebitda_post_franchise,
    ebitda_margin_pct: ebitdaMargin,
    payback_period_months: payback,
    irr_pct: irrPct,
    days_worked_per_year: daysPerYear(inputs),
  };

  const investment: InvestmentSummary = {
    total_initial_investment: fin.total_initial_investment,
    cash_required_at_close: year0CashOut,
    loan_principal: fin.loan_principal,
    monthly_loan_payment: fin.monthly_payment,
    payback_period_months: payback,
    irr_5yr_pct: irrPct,
    cumulative_cash_by_year: cumulativeCashByYear,
    marginal_truck_roi: marginalTruckROI(inputs, year1.labor_total),
  };

  const goal = buildGoal(
    inputs,
    year1.ebitda_post_franchise,
    year1.net_income,
    year1.owner_take_home_cash,
  );

  const info_keys: OutputInfoKeys = {
    kpis: { ...INVESTOR_INFO_KEYS.kpis },
    pnl: { ...INVESTOR_INFO_KEYS.pnl },
    investment: { ...INVESTOR_INFO_KEYS.investment },
  };

  const out: ProfitModelOutputs = {
    kpis,
    pnl: assemblePnL(year1),
    service_mix: assembleServiceMix(year1),
    cash_collected: assembleCashCollected(year1),
    investment,
    projection: projection.rows,
    chart_series: assembleChartSeries(projection.rows),
    goal,
    warnings,
    info_keys,
    franchisor: franchisorProfit(inputs, projection.yearly, year1.ebitda_post_franchise),
  };
  const city = cityRollup(inputs, year1);
  if (city) out.city_rollup = city;

  // Operator-mode outputs (§5.19–§5.25). Investor mode skips this entirely;
  // the helpers themselves were landed in PM-MIG-5 and PM-MIG-6.
  if (inputs.mode === 'operator' && inputs.operator_state) {
    const state = inputs.operator_state;
    const cash_bridge = buildCashBridge(inputs, state, fin);
    const trapped_working_capital = computeTrappedWorkingCapital(state);
    const runway = computeRunway(inputs, state);
    const ninety_day_cash_position = computeNinetyDayCash(inputs, state, fin);
    const thirteen_week_forecast = computeThirteenWeekForecast(inputs, state, fin);
    const severity_flags = buildSeverityFlags(
      inputs,
      state,
      cash_bridge,
      runway,
      thirteen_week_forecast,
    );

    out.cash_bridge = cash_bridge;
    out.trapped_working_capital = trapped_working_capital;
    out.runway = runway;
    out.ninety_day_cash_position = ninety_day_cash_position;
    out.thirteen_week_forecast = thirteen_week_forecast;
    out.severity_flags = severity_flags;

    out.info_keys.cash_bridge = OPERATOR_INFO_KEY_BLOCKS.cash_bridge;
    out.info_keys.trapped_working_capital =
      OPERATOR_INFO_KEY_BLOCKS.trapped_working_capital;
    out.info_keys.runway = OPERATOR_INFO_KEY_BLOCKS.runway;
    out.info_keys.ninety_day_cash_position =
      OPERATOR_INFO_KEY_BLOCKS.ninety_day_cash_position;
    out.info_keys.thirteen_week_forecast =
      OPERATOR_INFO_KEY_BLOCKS.thirteen_week_forecast;
  }

  return out;
}

// ─────────────────────────────────────────────────────────────
// §5.19–§5.25 Operator-mode helpers (cash diagnostic)
//
// These helpers run only when calculate() sees inputs.mode === 'operator'.
// Investor mode never invokes them. They take strongly-typed slices of
// OperatorState + the projected year-1 P&L and return new output blocks.
// PM-MIG-7 will wire them into calculate(); PM-MIG-5 only lands the math.
// ─────────────────────────────────────────────────────────────

/** §5.19 — Convert period actuals to annualized units. Used inside operator helpers. */
function annualizePeriod(state: OperatorState): {
  days_in_period: number;
  annualization_factor: number;
} {
  const start = new Date(state.period.start_date);
  const end = new Date(state.period.end_date);
  const days = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1,
  );
  return { days_in_period: days, annualization_factor: 365 / days };
}

/** §5.20 — Cash bridge: EBITDA → ending cash for the operator's reported period. */
function buildCashBridge(
  inputs: ProfitModelInputs,
  state: OperatorState,
  financing: FinancingComputed,
): CashBridge {
  const ebitda =
    state.period.net_sales -
    state.period.cogs_total -
    state.period.labor_total -
    state.period.fixed_costs_total;

  const days = annualizePeriod(state).days_in_period;
  const period_ratio = days / 365;

  // Non-cash addbacks scale to the period.
  const dep = depreciation(inputs) * period_ratio;
  const amort = inputs.cfo.amortization_annual * period_ratio;

  // Working capital deltas: medium tier required to compute, else zeros.
  // Heavy tier required for prepaids.
  const med = state.balance_sheet_medium;
  const heavy = state.balance_sheet_heavy;
  const wc_changes = {
    // Increase in AR = cash use (negative impact on cash).
    ar_delta: med ? -med.accounts_receivable : 0,
    // Increase in inventory = cash use.
    inventory_delta: med ? -med.inventory_value : 0,
    prepaid_delta: heavy ? -heavy.prepaid_expenses : 0,
    // Increase in AP = cash source (positive impact on cash).
    ap_delta: med ? med.accounts_payable : 0,
    net: 0,
  };
  wc_changes.net =
    wc_changes.ar_delta +
    wc_changes.inventory_delta +
    wc_changes.prepaid_delta +
    wc_changes.ap_delta;

  // Financing outflows scale to the period.
  const loan_principal = financing.year_1_principal_payment * period_ratio;
  const loan_interest = financing.year_1_interest_simple * period_ratio;
  const owner_draws = ownerBelowLineDraws(inputs) * period_ratio;

  // Sales tax remitted: estimated as net_sales × sales_tax_pct (PM-MIG-7 will
  // prefer PeriodActuals.sales_tax_remitted when that wiring lands).
  const sales_tax_remitted = state.period.net_sales * (inputs.sales_tax_pct / 100);
  // Income tax estimated at a flat 25% of taxable earnings.
  const taxable = ebitda - dep - amort - loan_interest;
  const income_tax_estimated = Math.max(0, taxable * 0.25);

  const ending_cash_reported = state.balance_sheet_light.cash_on_hand;
  const calc_change =
    ebitda +
    dep +
    amort +
    wc_changes.net -
    loan_principal -
    loan_interest -
    owner_draws -
    sales_tax_remitted -
    income_tax_estimated;
  // We don't have a reported starting balance, so derive it from the snapshot
  // and the calculated change. If books reconcile, ending_cash_calculated will
  // equal ending_cash_reported and reconciliation_diff = 0.
  const starting_cash = ending_cash_reported - calc_change;
  const ending_cash_calculated = starting_cash + calc_change;

  return {
    starting_cash,
    ebitda_period: ebitda,
    non_cash_addbacks: { depreciation: dep, amortization: amort },
    working_capital_changes: wc_changes,
    financing_outflows: { loan_principal, loan_interest, owner_draws },
    tax_outflows: { sales_tax_remitted, income_tax_estimated },
    ending_cash_calculated,
    ending_cash_reported,
    reconciliation_diff: ending_cash_calculated - ending_cash_reported,
  };
}

/** §5.21 — Working capital tied up in AR + inventory + prepaids, net of AP. */
function computeTrappedWorkingCapital(
  state: OperatorState,
): TrappedWorkingCapital {
  const med = state.balance_sheet_medium;
  const heavy = state.balance_sheet_heavy;
  const ar = med?.accounts_receivable ?? 0;
  const inv = med?.inventory_value ?? 0;
  const prepaid = heavy?.prepaid_expenses ?? 0;
  const ap = med?.accounts_payable ?? 0;
  return {
    accounts_receivable: ar,
    inventory_value: inv,
    prepaid_expenses: prepaid,
    accounts_payable_offset: ap,
    net_trapped: ar + inv + prepaid - ap,
  };
}

/** §5.22 — Runway months at current burn, with bucketed status. */
function computeRunway(
  _inputs: ProfitModelInputs,
  state: OperatorState,
): RunwayAnalysis {
  // Annualize period operating costs, then convert to monthly burn.
  const annual_cost =
    (state.period.cogs_total +
      state.period.labor_total +
      state.period.fixed_costs_total) *
    annualizePeriod(state).annualization_factor;
  const monthly_burn = annual_cost / 12;
  const cash = state.balance_sheet_light.cash_on_hand;
  const runway = monthly_burn <= 0 ? Infinity : cash / monthly_burn;

  let status: RunwayAnalysis['status'];
  if (runway >= 6) status = 'healthy';
  else if (runway >= 3) status = 'caution';
  else if (runway >= 1.5) status = 'warning';
  else status = 'critical';

  return {
    monthly_burn,
    cash_on_hand: cash,
    runway_months: runway,
    status,
  };
}

/** §5.23 — 90-day cash position summary. */
function computeNinetyDayCash(
  _inputs: ProfitModelInputs,
  state: OperatorState,
  financing: FinancingComputed,
): NinetyDayCashPosition {
  const period_days = annualizePeriod(state).days_in_period;
  const factor = annualizePeriod(state).annualization_factor;

  const annual_revenue = state.period.net_sales * factor;
  const ninety_day_revenue = annual_revenue * (90 / 365);
  const ninety_day_cogs = state.period.cogs_total * (90 / period_days);
  const ninety_day_labor = state.period.labor_total * (90 / period_days);
  const ninety_day_fixed = state.period.fixed_costs_total * (90 / period_days);
  const ninety_day_loan =
    (financing.year_1_interest_simple + financing.year_1_principal_payment) *
    (90 / 365);

  const now = new Date();
  const obligations_in_window = state.upcoming_obligations.filter((o) => {
    const due = new Date(o.due_date);
    const days = (due.getTime() - now.getTime()) / 86_400_000;
    return days >= 0 && days <= 90;
  });
  const obligations_total = obligations_in_window.reduce((sum, o) => sum + o.amount, 0);

  const inflows = ninety_day_revenue;
  const outflows =
    ninety_day_cogs +
    ninety_day_labor +
    ninety_day_fixed +
    ninety_day_loan +
    obligations_total;
  const starting = state.balance_sheet_light.cash_on_hand;
  const ending = starting + inflows - outflows;

  let status: NinetyDayCashPosition['status'];
  if (ending >= starting * 0.5) status = 'healthy';
  else if (ending >= 0) status = 'caution';
  else if (ending >= -starting * 0.5) status = 'warning';
  else status = 'critical';

  return {
    starting_cash: starting,
    projected_inflows: inflows,
    projected_outflows: outflows,
    ending_cash: ending,
    status,
  };
}

/** §5.24 — 13-week cash flow forecast. */
function computeThirteenWeekForecast(
  _inputs: ProfitModelInputs,
  state: OperatorState,
  financing: FinancingComputed,
): ThirteenWeekForecast {
  const factor = annualizePeriod(state).annualization_factor;
  const weekly_revenue = (state.period.net_sales * factor) / 52;
  const weekly_cogs = (state.period.cogs_total * factor) / 52;
  const weekly_labor = (state.period.labor_total * factor) / 52;
  const weekly_fixed = (state.period.fixed_costs_total * factor) / 52;
  const weekly_loan =
    (financing.year_1_interest_simple + financing.year_1_principal_payment) / 52;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  // Snap to the next Monday so each forecast row covers a Mon–Sun window.
  const dow = start.getDay();
  start.setDate(start.getDate() + ((8 - dow) % 7));

  const weeks: ThirteenWeekForecast = [];
  let opening = state.balance_sheet_light.cash_on_hand;
  for (let i = 0; i < 13; i++) {
    const weekStart = new Date(start.getTime() + i * 7 * 86_400_000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);

    const week_obligations = state.upcoming_obligations
      .filter((o) => {
        const due = new Date(o.due_date);
        return due >= weekStart && due < weekEnd;
      })
      .reduce((sum, o) => sum + o.amount, 0);

    const inflows = weekly_revenue;
    const outflows =
      weekly_cogs + weekly_labor + weekly_fixed + weekly_loan + week_obligations;
    const ending = opening + inflows - outflows;

    let severity: ThirteenWeekForecastWeek['severity'];
    if (ending >= opening * 0.5) severity = 'ok';
    else if (ending >= 0) severity = 'low';
    else severity = 'critical';

    weeks.push({
      week_index: i,
      week_start_date: weekStart.toISOString().slice(0, 10),
      opening_cash: opening,
      inflows,
      outflows,
      ending_cash: ending,
      severity,
    });
    opening = ending;
  }
  return weeks;
}

/** §5.25 — Severity flags — translates engine state into actionable warnings. */
function buildSeverityFlags(
  inputs: ProfitModelInputs,
  state: OperatorState,
  bridge: CashBridge,
  runway: RunwayAnalysis,
  forecast: ThirteenWeekForecast,
): SeverityFlag[] {
  const flags: SeverityFlag[] = [];
  const cash = state.balance_sheet_light.cash_on_hand;

  // 1. Sales tax obligation > current cash
  const sales_tax_due_soon = state.upcoming_obligations
    .filter((o) => o.category === 'sales_tax')
    .reduce((sum, o) => sum + o.amount, 0);
  if (sales_tax_due_soon > cash) {
    flags.push({
      id: 'sales_tax_underwater',
      severity: 'critical',
      glossary_key: 'sales_tax_obligation',
      title: 'Sales tax due exceeds cash on hand',
      message: `You owe $${sales_tax_due_soon.toLocaleString()} in sales tax but have $${cash.toLocaleString()} in cash. Sales tax is held in trust and must be remitted on time — late payment carries penalties and can lead to revocation of your sales tax permit.`,
      suggested_action:
        'Set aside sales tax in a separate account weekly. Review your remittance schedule.',
    });
  }

  // 2. Loan obligation > 30% of cash
  const loan_due_soon = state.upcoming_obligations
    .filter((o) => o.category === 'loan')
    .reduce((sum, o) => sum + o.amount, 0);
  if (loan_due_soon > cash * 0.3) {
    flags.push({
      id: 'loan_payment_pressure',
      severity: 'warning',
      glossary_key: 'debt_service_coverage',
      title: 'Loan payments will consume >30% of available cash',
      message: `Upcoming loan payments total $${loan_due_soon.toLocaleString()}, which is more than 30% of your $${cash.toLocaleString()} cash on hand.`,
      suggested_action:
        'Talk to your lender about timing. A short payment deferral may be cheaper than a working-capital line of credit.',
    });
  }

  // 3. Payroll obligation > current cash
  const payroll_due_soon = state.upcoming_obligations
    .filter((o) => o.category === 'payroll')
    .reduce((sum, o) => sum + o.amount, 0);
  if (payroll_due_soon > cash) {
    flags.push({
      id: 'payroll_underwater',
      severity: 'critical',
      glossary_key: 'payroll_obligation',
      title: 'Cannot make next payroll',
      message: `Upcoming payroll is $${payroll_due_soon.toLocaleString()} but cash on hand is $${cash.toLocaleString()}. Missing payroll triggers state wage-claim penalties immediately.`,
      suggested_action:
        'Halt owner draws and discretionary spend. Call the franchisor — emergency working-capital programs may be available.',
    });
  }

  // 4. Owner draws > 50% of period EBITDA
  const owner_draws =
    ownerBelowLineDraws(inputs) * (annualizePeriod(state).days_in_period / 365);
  if (bridge.ebitda_period > 0 && owner_draws > bridge.ebitda_period * 0.5) {
    flags.push({
      id: 'owner_draws_excessive',
      severity: 'warning',
      glossary_key: 'owner_draws',
      title: 'Owner draws are >50% of period EBITDA',
      message: `Period EBITDA is $${bridge.ebitda_period.toLocaleString()} and owner draws are $${owner_draws.toLocaleString()}. Sustained draws above 50% leave nothing for working capital, growth, or contingencies.`,
      suggested_action:
        'Cap monthly draws at 30% of trailing 3-month EBITDA until cash builds.',
    });
  }

  // 5. Runway < 3 months
  if (runway.runway_months < 3) {
    flags.push({
      id: 'low_runway',
      severity: runway.runway_months < 1.5 ? 'critical' : 'warning',
      glossary_key: 'runway',
      title: `${runway.runway_months.toFixed(1)} months of cash runway`,
      message: `At your current burn of $${runway.monthly_burn.toLocaleString()}/mo, you have ${runway.runway_months.toFixed(1)} months of operating cash if revenue stops.`,
      suggested_action:
        'Build a 90-day plan to either grow revenue, cut burn, or secure a credit line BEFORE you need it.',
    });
  }

  // 6. Forecast goes negative
  const negative_week = forecast.find((w) => w.ending_cash < 0);
  if (negative_week) {
    flags.push({
      id: 'forecast_negative',
      severity: 'critical',
      glossary_key: 'thirteen_week_forecast',
      title: `Cash projected to go negative in week ${negative_week.week_index + 1}`,
      message: `On the week of ${negative_week.week_start_date}, projected ending cash is $${negative_week.ending_cash.toLocaleString()}.`,
      suggested_action:
        'Review what hits that week. Often a single large payable can be deferred a week without penalty.',
    });
  }

  // 7. Cash bridge reconciliation diff > 5% of cash
  if (Math.abs(bridge.reconciliation_diff) > cash * 0.05) {
    flags.push({
      id: 'cash_bridge_diff',
      severity: 'warning',
      glossary_key: 'cash_bridge',
      title: 'Cash bridge does not reconcile to reported cash',
      message: `Calculated ending cash differs from reported by $${bridge.reconciliation_diff.toLocaleString()}. This usually means owner deposits/withdrawals not categorized, or A/R aging not reflected in the period actuals.`,
      suggested_action:
        'Reconcile bank deposits to revenue, and confirm all owner transactions are categorized.',
    });
  }

  return flags;
}
