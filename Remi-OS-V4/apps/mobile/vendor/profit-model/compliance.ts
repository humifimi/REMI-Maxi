// Part of the REMI profit-model engine.
// PM-MIG-9 — §4.17 PeriodActuals & FranchisorCompliancePolicy helpers.
//
// These helpers are NOT consumed by the calculator UI. They exist so the
// future Franchise Compliance Reporting product can reuse the engine's
// shared types (PeriodActuals, FranchisorCompliancePolicy) without forking
// the schema. Pure functions, deterministic, no side effects — same rules
// as the rest of the engine.
//
// See /Users/jacegalloway/Documents/Docs/docs/pdf-implementation-plans/plans/profit-model-v2-spec.md §4.17.

import type {
  FranchisorCompliancePolicy,
  PeriodActuals,
  ProfitModelInputs,
  ValidationWarning,
} from './types';

/**
 * §4.17 — Resolve the effective compliance policy for a given franchise.
 *
 * The base `policy` carries franchisor-wide defaults. `policy.overrides` is
 * an optional map keyed by `franchise_id` that allows per-franchise overrides
 * for any field except `id`, `franchisor_id`, and `overrides` itself (those
 * are stripped at the type level by `Partial<Omit<…>>`).
 *
 * Behavior:
 *   - No override entry for `franchiseId` → the base policy is returned
 *     by reference (cheap fast-path).
 *   - Override exists → a new object is returned with the override fields
 *     shallow-merged on top of the base. The top-level `overrides` map is
 *     preserved on the result so subsequent calls for sibling franchises
 *     still work against the same merged policy object.
 */
export function resolveCompliancePolicy(
  policy: FranchisorCompliancePolicy,
  franchiseId: string,
): FranchisorCompliancePolicy {
  const override = policy.overrides?.[franchiseId];
  if (!override) return policy;
  return {
    ...policy,
    ...override,
    // Re-pin the original overrides map so downstream lookups still resolve.
    overrides: policy.overrides,
  };
}

/**
 * §4.17 — Validate a PeriodActuals submission against engine + policy rules.
 *
 * Returns a list of warnings (level: 'error' | 'warn' | 'info'). Never throws —
 * the consuming product decides how to render each level. An empty array
 * means the submission is fully valid against current policy.
 *
 * Rules covered:
 *   - balance_sheet_light.cash_on_hand must be >= 0 (error)
 *   - pnl.net_sales must be >= 0 (error)
 *   - pnl.sales_tax_remitted must be <= pnl.sales_tax_collected (error)
 *   - period.cadence should match policy.default_cadence (info if mismatch)
 *   - metadata.review_status === 'rejected' (warn — needs reviewer notes addressed)
 */
export function validateForCompliance(
  actuals: PeriodActuals,
  policy: FranchisorCompliancePolicy,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  if (actuals.balance_sheet_light.cash_on_hand < 0) {
    warnings.push({
      level: 'error',
      field: 'balance_sheet_light.cash_on_hand',
      message: 'Cash on hand cannot be negative.',
    });
  }

  if (actuals.pnl.net_sales < 0) {
    warnings.push({
      level: 'error',
      field: 'pnl.net_sales',
      message: 'Net sales cannot be negative.',
    });
  }

  const tax_diff =
    actuals.pnl.sales_tax_collected - actuals.pnl.sales_tax_remitted;
  if (tax_diff < 0) {
    warnings.push({
      level: 'error',
      field: 'pnl.sales_tax_remitted',
      message:
        'Sales tax remitted exceeds sales tax collected — likely a data entry error.',
    });
  }

  if (actuals.period.cadence !== policy.default_cadence) {
    warnings.push({
      level: 'info',
      field: 'period.cadence',
      message: `Submitted as ${actuals.period.cadence}; franchisor default is ${policy.default_cadence}.`,
    });
  }

  if (actuals.metadata.review_status === 'rejected') {
    warnings.push({
      level: 'warn',
      field: 'metadata.review_status',
      message:
        'This submission was rejected. Address reviewer notes and resubmit.',
    });
  }

  return warnings;
}

/** Result of `computeRoyaltyForPeriod`. */
export interface RoyaltyComputation {
  /** Cash actually owed for this submission's period. */
  amount_due: number;
  /** Engine's straight-percentage estimate for the period (royalty_pct × net_sales). */
  amount_estimated: number;
  /** Quarterly true-up delta (only non-zero for trueup cadence on quarterly cadence). */
  true_up: number;
}

/**
 * §4.17 — Compute royalty for a reporting period given the policy true-up cadence.
 *
 * Modes:
 *   - `monthly`: full royalty due each month based on the period's net sales.
 *   - `quarterly`: only quarterly submissions trigger a payment; monthly
 *     submissions accumulate (amount_due = 0, amount_estimated = period royalty).
 *   - `monthly_estimated_quarterly_trueup`: monthly submissions pay 95% of the
 *     period's straight-percentage royalty as an estimate; quarterly submissions
 *     pay the remaining 5% as the true-up.
 *
 * `amount_estimated` is always the straight-percentage royalty for the period
 * regardless of cadence — it is the engine's "fair-share" view that the
 * consumer can reconcile against actual payments.
 */
export function computeRoyaltyForPeriod(
  actuals: PeriodActuals,
  inputs: ProfitModelInputs,
  policy: FranchisorCompliancePolicy,
): RoyaltyComputation {
  const royalty_pct = inputs.royalty_pct_of_net_sales / 100;
  const period_royalty = actuals.pnl.net_sales * royalty_pct;

  switch (policy.royalty_truesup) {
    case 'monthly':
      return {
        amount_due: period_royalty,
        amount_estimated: period_royalty,
        true_up: 0,
      };

    case 'quarterly':
      if (actuals.period.cadence === 'quarterly') {
        return {
          amount_due: period_royalty,
          amount_estimated: period_royalty,
          true_up: 0,
        };
      }
      // Monthly (or annual) submission against a quarterly-pay policy —
      // accumulate; nothing due this submission.
      return {
        amount_due: 0,
        amount_estimated: period_royalty,
        true_up: 0,
      };

    case 'monthly_estimated_quarterly_trueup':
      if (actuals.period.cadence === 'monthly') {
        return {
          amount_due: period_royalty * 0.95,
          amount_estimated: period_royalty,
          true_up: 0,
        };
      }
      return {
        amount_due: period_royalty * 0.05,
        amount_estimated: period_royalty,
        true_up: period_royalty * 0.05,
      };

    default:
      return {
        amount_due: period_royalty,
        amount_estimated: period_royalty,
        true_up: 0,
      };
  }
}
