import type { ModelPricing, UsageInput } from './types.js';
/**
 * All monetary arithmetic uses BigInt microdollars (1 USD = 10_000_000_000 microdollars)
 * to avoid floating-point accumulation across thousands of LLM calls.
 *
 * Precision: 10 decimal places — sufficient for even sub-cent token costs.
 * Conversion to USD only happens at display time.
 */
export declare const MICRO_PER_USD = 10000000000n;
/**
 * Convert a USD float (e.g. 0.000003) to microdollar BigInt.
 * Rounds to the nearest microdollar to avoid fractional BigInt operations.
 */
export declare function usdToMicro(usd: number): bigint;
/**
 * Convert microdollar BigInt back to a USD float.
 * Only call at output/display time — never use for intermediate arithmetic.
 */
export declare function microToUsd(micro: bigint): number;
/**
 * Calculate the cost of a single LLM call in microdollars (BigInt).
 * Handles optional cache pricing gracefully (falls back to input rate if not set).
 */
export declare function calcCostMicro(usage: UsageInput, pricing: ModelPricing): bigint;
//# sourceMappingURL=math.d.ts.map