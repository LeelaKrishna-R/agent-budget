import { TypedEmitter } from './emitter.js';
import { type AgentBudgetOptions, type BudgetEventMap, type BudgetSnapshot, type CallEntry, type ModelBreakdown, type PricingMap, type UsageInput } from './types.js';
export declare class AgentBudget extends TypedEmitter<BudgetEventMap> {
    readonly limitUSD: number;
    readonly warnAtPercent: number;
    readonly defaultModel: string | null;
    readonly throwOnExceeded: boolean;
    readonly guardBefore: boolean;
    private readonly _pricingMap;
    private _usedMicro;
    private _calls;
    private _callCounter;
    private _totalInputTokens;
    private _totalOutputTokens;
    private _totalCacheReadTokens;
    private _totalCacheWriteTokens;
    private _modelMicro;
    private _modelStats;
    private _warnFired;
    private _exceededFired;
    constructor(options?: AgentBudgetOptions);
    /**
     * Track a completed LLM call.
     *
     * @param usage  - Token counts for the call.
     * @param model  - Model key (overrides constructor default).
     * @param label  - Optional human-readable label for this call (e.g. "summarize step").
     * @returns      A frozen snapshot of the current budget state.
     * @throws       {UnknownModelError}   if model is not registered.
     * @throws       {BudgetConfigError}   if model is not provided.
     * @throws       {BudgetExceededError} if throwOnExceeded is true and limit is hit.
     */
    track(usage: UsageInput, model?: string, label?: string): BudgetSnapshot;
    /**
     * Wrap an async LLM call — automatically extracts and tracks token usage.
     *
     * If guardBefore is true (or passed inline), asserts budget is not exceeded
     * BEFORE making the call, preventing spend when already over budget.
     *
     * @param fn     - Async function that returns a raw LLM provider response.
     * @param model  - Model key.
     * @param opts   - { label?, guardBefore? } — inline overrides.
     */
    wrap<T>(fn: () => Promise<T>, model?: string, opts?: {
        label?: string;
        guardBefore?: boolean;
    }): Promise<T>;
    /**
     * Throw a BudgetExceededError if the budget is currently exceeded.
     * Call this BEFORE making an LLM request to prevent runaway spend.
     */
    assertNotExceeded(): void;
    /**
     * Reset all counters and state. Optionally keep the pricing map and config.
     * Emits the 'reset' event after clearing.
     */
    reset(): void;
    get exceeded(): boolean;
    get usedUSD(): number;
    get remaining(): number;
    get callCount(): number;
    /** Returns a frozen snapshot of the current budget state. O(1). */
    snapshot(): BudgetSnapshot;
    /**
     * Returns per-model cost breakdown.
     * O(number of distinct models) — not O(number of calls).
     */
    breakdown(): ModelBreakdown;
    /**
     * Returns a defensive deep-copy of the call log.
     * Callers cannot mutate internal state through this array.
     */
    log(): CallEntry[];
    /**
     * Register a new model (or override an existing one) in the global pricing table.
     * Affects all future AgentBudget instances that do not supply their own pricing map.
     * Does NOT affect existing instances.
     *
     * @param key          - Model identifier string.
     * @param inputPer1M   - Input token cost per 1M tokens (USD).
     * @param outputPer1M  - Output token cost per 1M tokens (USD).
     * @param cachePricing - Optional cache pricing.
     */
    static registerModel(key: string, inputPer1M: number, outputPer1M: number, cachePricing?: {
        cacheReadPer1M?: number;
        cacheWritePer1M?: number;
    }): void;
    /** Returns a snapshot of the global pricing registry. */
    static listModels(): PricingMap;
    private _buildSnapshot;
}
//# sourceMappingURL=budget.d.ts.map