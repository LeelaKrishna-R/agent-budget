/**
 * All monetary arithmetic uses BigInt microdollars (1 USD = 10_000_000_000 microdollars)
 * to avoid floating-point accumulation across thousands of LLM calls.
 *
 * Precision: 10 decimal places — sufficient for even sub-cent token costs.
 * Conversion to USD only happens at display time.
 */
export const MICRO_PER_USD = 10000000000n; // 1e10
/**
 * Convert a USD float (e.g. 0.000003) to microdollar BigInt.
 * Rounds to the nearest microdollar to avoid fractional BigInt operations.
 */
export function usdToMicro(usd) {
    // Use string rounding to dodge float rounding at the conversion boundary
    return BigInt(Math.round(usd * Number(MICRO_PER_USD)));
}
/**
 * Convert microdollar BigInt back to a USD float.
 * Only call at output/display time — never use for intermediate arithmetic.
 */
export function microToUsd(micro) {
    // Divide via string to preserve precision; JS BigInt division truncates
    const whole = micro / MICRO_PER_USD;
    const frac = micro % MICRO_PER_USD;
    return Number(whole) + Number(frac) / Number(MICRO_PER_USD);
}
/**
 * Calculate the cost of a single LLM call in microdollars (BigInt).
 * Handles optional cache pricing gracefully (falls back to input rate if not set).
 */
export function calcCostMicro(usage, pricing) {
    const inputCost = usdToMicro((usage.inputTokens / 1000000) * pricing.input);
    const outputCost = usdToMicro((usage.outputTokens / 1000000) * pricing.output);
    const cacheReadRate = pricing.cacheRead ?? pricing.input;
    const cacheWriteRate = pricing.cacheWrite ?? pricing.input;
    const cacheWrite1hRate = pricing.cacheWrite1h ?? pricing.input * 2;
    // A 1-hour write is part of cacheWriteTokens, billed at its own rate; the rest is a 5-minute write
    const written = usage.cacheWriteTokens ?? 0;
    const hour = Math.min(usage.cacheWrite1hTokens ?? 0, written);
    const cacheReadCost = usdToMicro(((usage.cacheReadTokens ?? 0) / 1000000) * cacheReadRate);
    const cacheWriteCost = usdToMicro(((written - hour) / 1000000) * cacheWriteRate) +
        usdToMicro((hour / 1000000) * cacheWrite1hRate);
    return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}
//# sourceMappingURL=math.js.map