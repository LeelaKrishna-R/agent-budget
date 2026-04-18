import type { PricingMap } from './types.js';
/**
 * Built-in pricing table (USD per 1M tokens).
 * Sources: official provider pricing pages — last verified April 2026.
 * This is a readonly baseline. Override per-instance via AgentBudgetOptions.pricing.
 * Add new models globally via AgentBudget.registerModel().
 */
export declare const BUILTIN_PRICING: Readonly<PricingMap>;
/**
 * Global registry — extended via AgentBudget.registerModel().
 * Separate from BUILTIN_PRICING so overrides are detectable.
 */
export declare const globalRegistry: PricingMap;
/**
 * Exact-key resolution only — no fuzzy matching.
 * Fuzzy matching on financial data is a footgun.
 */
export declare function resolvePricing(model: string, map: PricingMap): import("./types.js").ModelPricing;
//# sourceMappingURL=pricing.d.ts.map