// Part of the REMI profit-model engine.
// PM-MIG-8 — Canonical glossary used by both the engine output annotations
// and the frontend info-icon components.
//
// Keys are stable identifiers used by the engine in `info_keys` blocks and
// `SeverityFlag.glossary_key`, and by the UI in <InfoIcon glossaryKey="..." />.
//
// Editing rules:
//   - Never rename a key after it ships (UI components reference them).
//   - `short` is the tooltip / title attribute (≤ 200 chars recommended).
//   - `long` is the toggleable explainer block (markdown-ish; line breaks preserved).
//   - When adding a new key, also add a UI test that surfaces it.
//
// See /Users/jacegalloway/Documents/Docs/docs/pdf-implementation-plans/plans/profit-model-v2-spec.md.

export interface GlossaryEntry {
  key: string;
  label: string;
  short: string;
  long: string;
  /** Optional learn-more link to a deeper docs page. */
  external_url?: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  ebitda: {
    key: 'ebitda',
    label: 'EBITDA',
    short:
      'Earnings before interest, taxes, depreciation, and amortization. A proxy for operating cash flow.',
    long: 'EBITDA strips out non-operating costs (interest), tax decisions, and non-cash accounting (depreciation, amortization) so you can compare core operating performance across businesses with different capital structures and tax situations. Use it for benchmarking and bank conversations. It is NOT the same as cash in the bank — see "cash_bridge" for the gap.',
  },
  net_income: {
    key: 'net_income',
    label: 'Net Income',
    short:
      'Profit after every expense including taxes and loan interest. The bottom line.',
    long: 'Net income is what tax law sees as your profit. It includes depreciation (which reduces it), loan interest (which reduces it), but NOT loan principal payments (which are not an expense). Net income drives your tax bill but does not equal cash on hand.',
  },
  net_sales: {
    key: 'net_sales',
    label: 'Net Sales',
    short:
      'Gross revenue minus discounts. Sales tax and tips are excluded; this is the franchise-fee and royalty base.',
    long: 'Net sales = (service revenue + add-on revenue) − discounts. Sales tax is collected on top of net sales but never enters the P&L (see "sales_tax_obligation"). Tips are pass-through to employees and not included. Royalty and ad-fund percentages apply to net sales, not gross revenue or EBITDA.',
  },
  ebitda_margin: {
    key: 'ebitda_margin',
    label: 'EBITDA Margin',
    short:
      'EBITDA as a percentage of net sales. The single best one-number quality metric for an operating business.',
    long: 'EBITDA margin = EBITDA ÷ net sales. Mobile services franchises in the 18–25% range are healthy. Below 12% is thin and leaves no room for surprise. Above 30% usually means under-investment in labor or fleet that will catch up later.',
  },
  owner_take_home: {
    key: 'owner_take_home',
    label: 'Owner Take-Home Cash',
    short:
      'Cash you can move to your personal account each month after every business obligation.',
    long: 'Owner take-home is calculated as net income + depreciation + amortization − loan principal − required working capital reinvestment + owner wages + below-line draws. This is closer to "what could I pay myself sustainably" than EBITDA or net income.',
  },
  payback_period: {
    key: 'payback_period',
    label: 'Payback Period',
    short:
      'How long until cumulative cash flow recovers your initial investment.',
    long: 'Payback period is the simplest investment yardstick. If your initial investment is $200k and you generate $50k/year of free cash flow, payback is 4 years. It ignores the time value of money (a dollar in year 5 is worth less than a dollar today) — for that, see "irr_5yr".',
  },
  irr_5yr: {
    key: 'irr_5yr',
    label: '5-Year IRR',
    short:
      'Annualized return rate over 5 years, accounting for the time value of money.',
    long: 'IRR (Internal Rate of Return) is the discount rate at which the net present value of all cash flows equals zero. A 15% IRR means your money grew at 15% per year compounded. Compare to alternative investments: an S&P index fund averages ~10% IRR. Anything below 10% IRR for a hands-on business is poor.',
  },
  cash_bridge: {
    key: 'cash_bridge',
    label: 'Cash Bridge',
    short:
      'Step-by-step reconciliation from EBITDA (accounting profit) to actual cash in the bank.',
    long: "EBITDA can say you are profitable while the bank account empties. The cash bridge shows why: depreciation (added back, non-cash), working capital growth (cash trapped in receivables/inventory), loan principal (reduces cash, not on P&L), tax payments (real cash out). If your bridge does not reconcile to your reported cash, something is uncategorized — usually owner deposits/withdrawals.",
  },
  trapped_working_capital: {
    key: 'trapped_working_capital',
    label: 'Trapped Working Capital',
    short:
      'Cash sitting in receivables, inventory, and prepaid expenses — money you have earned but cannot spend.',
    long: 'Calculated as: Accounts Receivable + Inventory + Prepaid Expenses − Accounts Payable. Growing trapped working capital is a silent killer for growing businesses: revenue goes up, profit goes up, but cash stays flat or drops. Common cure: tighten payment terms with customers, slim down inventory.',
  },
  runway: {
    key: 'runway',
    label: 'Runway (months)',
    short:
      'Months of operating costs your current cash can cover if all revenue stopped today.',
    long: 'Runway = cash on hand / monthly operating burn. Healthy: 6+ months. Caution: 3–6 months. Warning: 1.5–3 months. Critical: under 1.5 months. Runway shrinks during growth (working capital sucks up cash) — plan financing before you see <3 months of runway.',
  },
  ninety_day_cash_position: {
    key: 'ninety_day_cash_position',
    label: '90-Day Cash Position',
    short:
      'Projected ending cash 90 days out, given current revenue, fixed costs, loan service, and known obligations.',
    long: '90-day cash position rolls forward starting cash by the next quarter of inflows minus outflows, including any scheduled obligations (sales-tax remittance, payroll, loan payments). Use it to spot a crunch before it arrives. Pair with the 13-week forecast for week-by-week granularity.',
  },
  thirteen_week_forecast: {
    key: 'thirteen_week_forecast',
    label: '13-Week Cash Flow Forecast',
    short:
      'Week-by-week projection of opening and ending cash for the next 90 days.',
    long: 'A 13-week forecast is the standard tool for spotting near-term cash crunches. It assumes weekly revenue tracks the trailing period and overlays scheduled obligations (loan payments, sales tax remittance, payroll). Any week where ending cash drops below zero is a forced action — secure financing, defer a payment, or cut spend.',
  },
  working_capital: {
    key: 'working_capital',
    label: 'Working Capital',
    short:
      'Current assets minus current liabilities. The cash buffer that keeps day-to-day operations running.',
    long: 'Working capital = (Cash + Accounts Receivable + Inventory) − (Accounts Payable + Short-term Debt). Negative working capital means you cannot meet near-term obligations from current assets alone — a red flag that often precedes insolvency even when the P&L looks fine.',
  },
  debt_service_coverage: {
    key: 'debt_service_coverage',
    label: 'Debt Service Coverage Ratio (DSCR)',
    short:
      'EBITDA divided by total debt payments. Banks require this to stay above 1.25.',
    long: 'DSCR = EBITDA / (annual loan principal + interest). A ratio of 1.0 means every dollar of operating profit goes to loan payments — no cash left for the owner. Banks typically want 1.25 minimum and will call your loan if it drops below 1.0 for two quarters.',
  },
  sales_tax_obligation: {
    key: 'sales_tax_obligation',
    label: 'Sales Tax Trust Obligation',
    short:
      'Sales tax you collect is held in trust for the state — not your money.',
    long: 'Sales tax is the most legally serious obligation a small business has. The IRS and state tax authorities can pierce LLC/corporation protection (the "trust fund recovery penalty") to come after you personally if sales tax is not remitted. Always sweep collected sales tax into a separate account weekly.',
  },
  payroll_obligation: {
    key: 'payroll_obligation',
    label: 'Payroll Obligation',
    short:
      'Wages owed to employees. Missing payroll is a state wage-claim violation, immediately.',
    long: 'Unlike vendor payments, payroll cannot be deferred without notice. Missing or short-paying payroll triggers state Department of Labor wage claims with multiplier penalties. If cash will not cover payroll, the only legal options are: secure emergency financing, reduce hours/headcount with proper notice, or consider Chapter 11 protection.',
  },
  owner_draws: {
    key: 'owner_draws',
    label: 'Owner Draws / Distributions',
    short:
      'Cash you take out of the business above your wage. Reduces working capital.',
    long: 'Distributions are legitimate when EBITDA supports them. Sustained draws above 50% of EBITDA leave nothing for working capital growth, contingencies, or reinvestment — common cause of growth-stage cash crises.',
  },
  royalty: {
    key: 'royalty',
    label: 'Royalty Fee',
    short:
      'A percentage of net sales paid to the franchisor for ongoing brand and system access.',
    long: 'Royalty is paid on net sales (gross sales minus discounts), NOT on profit. Even unprofitable franchises pay royalty. Typical range is 5–9% of net sales. REMI charges 7% in the default model.',
  },
  ad_fund: {
    key: 'ad_fund',
    label: 'Ad Fund / Marketing Fund',
    short: 'A pooled marketing contribution paid to the franchisor.',
    long: 'Most franchise systems pool advertising spend into a national or regional fund. Operators contribute a percentage of net sales (typically 1–3%). The franchisor spends it on brand campaigns; individual operators usually do not control allocation.',
  },
  cogs: {
    key: 'cogs',
    label: 'Cost of Goods Sold (COGS)',
    short:
      'The variable cost of fulfilling each job — oil, parts, batteries, tires, consumables.',
    long: 'COGS scales with revenue: more jobs = more COGS. Labor is tracked separately (see "labor"). Track COGS per service line to spot pricing erosion: if COGS per job creeps up faster than price, your gross margin is shrinking.',
  },
  labor: {
    key: 'labor',
    label: 'Labor',
    short:
      'Wages, employer payroll taxes, workers comp, benefits, and payroll processing — every dollar to put a person in the truck.',
    long: 'Labor includes base wages + employer-side FICA/FUTA/SUTA + workers comp + health benefits + payroll processing. Owner wages are included if compensation_mode is "wages_in_payroll"; otherwise owners take distributions below the line. Underestimating labor is the most common reason new operators miss their numbers.',
  },
  fixed_costs: {
    key: 'fixed_costs',
    label: 'Fixed Costs',
    short:
      'Monthly costs that do not scale with jobs — rent, insurance, software, vehicle leases, utilities.',
    long: 'Fixed costs are charged whether you do 0 jobs or 1,000. Each line has its own annual growth rate (rent typically rises faster than software). Watch for fixed cost creep: small monthly increases compound to meaningful annual hits in year 3+.',
  },
  cash_required_at_close: {
    key: 'cash_required_at_close',
    label: 'Cash Required at Close',
    short:
      'Total cash you need to write a check for at closing — down payment plus working capital reserve.',
    long: 'Cash required = down payment on the loan (or full purchase if cash) + initial working capital buffer + closing fees. Banks expect 6 months of operating expenses in working capital before they will fund. Underfunding working capital is the #1 cause of new-franchise failure within 18 months.',
  },
  total_initial_investment: {
    key: 'total_initial_investment',
    label: 'Total Initial Investment',
    short:
      'Everything it costs to open: trucks, buildout, franchise fee, territory fee, working capital.',
    long: 'Total initial investment is the all-in cost to launch — before any revenue. Includes trucks (financed or cash), shop buildout, the upfront franchise fee, optional territory development fee, and the cash working-capital buffer. Compare against the FDD Item 7 range.',
  },
  marginal_truck_roi: {
    key: 'marginal_truck_roi',
    label: 'Marginal Truck ROI',
    short:
      'Annual EBITDA generated by adding one more truck, divided by truck cost. The growth-decision metric.',
    long: 'For each service line, marginal truck ROI projects what one additional truck would add: incremental revenue minus incremental COGS, labor, and franchise fees. Use it to rank where a growth dollar earns the most. A line with <15% marginal ROI is rarely worth a new truck unless you have territory pressure to defend.',
  },
};

export function getGlossaryEntry(key: string): GlossaryEntry | undefined {
  return GLOSSARY[key];
}
