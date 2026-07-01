// Public entry point for the REMI profit-model engine.
// Re-exports the full public surface used by REMIBackend, REMIDashboard and
// REMITechnician (the latter two via vendored copies).
// See /Users/jacegalloway/Documents/Docs/docs/pdf-implementation-plans/plans/profit-model-v2-spec.md.

/** Bumped on any breaking change to ProfitModelInputs / ProfitModelOutputs. */
export const ENGINE_VERSION = '3.2.0';

export * from './types';
export { calculate, amortizeLoan } from './engine';
export type { AmortizationResult, AmortizationYear } from './engine';
export { defaults, presets } from './presets';
export { validateInputs, clampInputs } from './validation';
export { encode, decode, CODEC_VERSION } from './share-codec';
export { currency, percent, months_to_human } from './format';
export type { CurrencyOptions } from './format';
export { GLOSSARY, getGlossaryEntry } from './glossary';
export type { GlossaryEntry } from './glossary';
export {
  resolveCompliancePolicy,
  validateForCompliance,
  computeRoyaltyForPeriod,
} from './compliance';
export type { RoyaltyComputation } from './compliance';
