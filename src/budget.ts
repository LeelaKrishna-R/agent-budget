import { TypedEmitter }                        from './emitter.js';
import { calcCostMicro, microToUsd, MICRO_PER_USD } from './math.js';
import { globalRegistry, resolvePricing }     from './pricing.js';
import { extractUsage, validateUsage }        from './extract.js';
import {
  BudgetExceededError,
  BudgetConfigError,
  UnknownModelError,
  type AgentBudgetOptions,
  type BudgetEventMap,
  type BudgetSnapshot,
  type CallEntry,
  type ModelBreakdown,
  type PricingMap,
  type UsageInput,
} from './types.js';

export class AgentBudget extends TypedEmitter<BudgetEventMap> {
  // ─── Config (immutable after construction) ──────────────────────────────────
  readonly limitUSD:        number;
  readonly warnAtPercent:   number;
  readonly defaultModel:    string | null;
  readonly throwOnExceeded: boolean;
  readonly guardBefore:     boolean;

  private readonly _pricingMap: PricingMap;

  // ─── Mutable state ──────────────────────────────────────────────────────────
  // All monetary state lives in microdollars (BigInt) to avoid float drift.
  private _usedMicro:            bigint = 0n;
  private _calls:                CallEntry[] = [];
  private _callCounter:          number = 0;

  // Running token totals — updated incrementally, never re-summed from _calls.
  private _totalInputTokens:     number = 0;
  private _totalOutputTokens:    number = 0;
  private _totalCacheReadTokens: number = 0;
  private _totalCacheWriteTokens:number = 0;

  // Per-model micro totals — avoid recomputing breakdown from scratch on every call.
  private _modelMicro:  Map<string, bigint> = new Map();
  private _modelStats:  Map<string, { calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }> = new Map();

  private _warnFired:   boolean = false;
  private _exceededFired:boolean = false;

  // ─── Constructor ────────────────────────────────────────────────────────────

  constructor(options: AgentBudgetOptions = {}) {
    super();

    const limit = options.limitUSD ?? 1.00;
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new BudgetConfigError(`limitUSD must be a positive finite number, got: ${limit}`);
    }

    const warnAt = options.warnAtPercent ?? 80;
    if (!Number.isFinite(warnAt) || warnAt < 0 || warnAt > 100) {
      throw new BudgetConfigError(`warnAtPercent must be between 0 and 100, got: ${warnAt}`);
    }

    this.limitUSD        = limit;
    this.warnAtPercent   = warnAt;
    this.defaultModel    = options.model ?? null;
    this.throwOnExceeded = options.throwOnExceeded ?? false;
    this.guardBefore     = options.guardBefore ?? false;

    // Instance-level pricing: merge global registry with any caller-supplied overrides.
    // This does NOT mutate the global table.
    this._pricingMap = options.pricing
      ? { ...globalRegistry, ...options.pricing }
      : globalRegistry;
  }

  // ─── Public: tracking ───────────────────────────────────────────────────────

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
  track(usage: UsageInput, model?: string, label?: string): BudgetSnapshot {
    const resolvedModel = model ?? this.defaultModel;
    if (!resolvedModel) {
      throw new BudgetConfigError(
        'model is required. Pass it as the second argument to .track(), or set a default in the constructor.',
      );
    }

    validateUsage(usage);

    const pricing = resolvePricing(resolvedModel, this._pricingMap);
    const costMicro = calcCostMicro(usage, pricing);

    // ── Accumulate state atomically ───────────────────────────────────────────
    this._usedMicro             += costMicro;
    this._totalInputTokens      += usage.inputTokens;
    this._totalOutputTokens     += usage.outputTokens;
    this._totalCacheReadTokens  += usage.cacheReadTokens  ?? 0;
    this._totalCacheWriteTokens += usage.cacheWriteTokens ?? 0;

    // Increment per-model counters
    const prev = this._modelMicro.get(resolvedModel) ?? 0n;
    this._modelMicro.set(resolvedModel, prev + costMicro);

    const prevStats = this._modelStats.get(resolvedModel) ?? { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    this._modelStats.set(resolvedModel, {
      calls:            prevStats.calls + 1,
      inputTokens:      prevStats.inputTokens  + usage.inputTokens,
      outputTokens:     prevStats.outputTokens + usage.outputTokens,
      cacheReadTokens:  prevStats.cacheReadTokens  + (usage.cacheReadTokens  ?? 0),
      cacheWriteTokens: prevStats.cacheWriteTokens + (usage.cacheWriteTokens ?? 0),
    });

    const entry: CallEntry = Object.freeze({
      id:               ++this._callCounter,
      ts:               Date.now(),
      model:            resolvedModel,
      inputTokens:      usage.inputTokens,
      outputTokens:     usage.outputTokens,
      cacheReadTokens:  usage.cacheReadTokens  ?? 0,
      cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      costMicro,
      costUSD:          microToUsd(costMicro),
      label,
    });

    this._calls.push(entry);

    const snap = this._buildSnapshot();

    // ── Events — strict fire-once semantics ───────────────────────────────────
    this.emit('tick', snap, entry);

    if (!this._warnFired && snap.percentUsed >= this.warnAtPercent) {
      this._warnFired = true;
      // Rebuild snapshot so warned=true is reflected in the event payload
      const warnSnap = this._buildSnapshot();
      this.emit('warn', warnSnap);
    }

    if (snap.exceeded) {
      if (!this._exceededFired) {
        this._exceededFired = true;
        // Rebuild so exceeded=true and warned=true are both reflected
        const exceededSnap = this._buildSnapshot();
        this.emit('exceeded', exceededSnap);
        if (this.throwOnExceeded) {
          throw new BudgetExceededError(exceededSnap, entry);
        }
      } else if (this.throwOnExceeded) {
        throw new BudgetExceededError(snap, entry);
      }
    }

    return snap;
  }

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
  async wrap<T>(
    fn: () => Promise<T>,
    model?: string,
    opts: { label?: string; guardBefore?: boolean } = {},
  ): Promise<T> {
    const shouldGuard = opts.guardBefore ?? this.guardBefore;
    if (shouldGuard) this.assertNotExceeded();

    const response = await fn();
    const usage    = extractUsage(response);
    this.track(usage, model ?? this.defaultModel ?? undefined, opts.label);
    return response;
  }

  // ─── Public: control ────────────────────────────────────────────────────────

  /**
   * Throw a BudgetExceededError if the budget is currently exceeded.
   * Call this BEFORE making an LLM request to prevent runaway spend.
   */
  assertNotExceeded(): void {
    if (this.exceeded) throw new BudgetExceededError(this._buildSnapshot());
  }

  /**
   * Reset all counters and state. Optionally keep the pricing map and config.
   * Emits the 'reset' event after clearing.
   */
  reset(): void {
    this._usedMicro             = 0n;
    this._calls                 = [];
    this._callCounter           = 0;
    this._totalInputTokens      = 0;
    this._totalOutputTokens     = 0;
    this._totalCacheReadTokens  = 0;
    this._totalCacheWriteTokens = 0;
    this._modelMicro            = new Map();
    this._modelStats            = new Map();
    this._warnFired             = false;
    this._exceededFired         = false;
    this.emit('reset');
  }

  // ─── Public: getters ────────────────────────────────────────────────────────

  get exceeded():   boolean { return this._usedMicro >= BigInt(Math.round(this.limitUSD * Number(MICRO_PER_USD))); }
  get usedUSD():    number  { return microToUsd(this._usedMicro); }
  get remaining():  number  { return Math.max(0, this.limitUSD - this.usedUSD); }
  get callCount():  number  { return this._calls.length; }

  // ─── Public: reporting ──────────────────────────────────────────────────────

  /** Returns a frozen snapshot of the current budget state. O(1). */
  snapshot(): BudgetSnapshot {
    return this._buildSnapshot();
  }

  /**
   * Returns per-model cost breakdown.
   * O(number of distinct models) — not O(number of calls).
   */
  breakdown(): ModelBreakdown {
    const totalMicro = this._usedMicro === 0n ? 1n : this._usedMicro; // avoid div/0
    const result: ModelBreakdown = {};

    for (const [model, micro] of this._modelMicro) {
      const stats   = this._modelStats.get(model)!;
      const costUSD = microToUsd(micro);
      const share   = this._usedMicro === 0n
        ? 0
        : parseFloat(((Number(micro) / Number(totalMicro)) * 100).toFixed(2));

      result[model] = {
        calls:            stats.calls,
        inputTokens:      stats.inputTokens,
        outputTokens:     stats.outputTokens,
        cacheReadTokens:  stats.cacheReadTokens,
        cacheWriteTokens: stats.cacheWriteTokens,
        costUSD:          parseFloat(costUSD.toFixed(8)),
        sharePercent:     share,
      };
    }
    return result;
  }

  /**
   * Returns a defensive deep-copy of the call log.
   * Callers cannot mutate internal state through this array.
   */
  log(): CallEntry[] {
    // Entries are already frozen; we only need to copy the array itself.
    return [...this._calls];
  }

  // ─── Static: global registry ────────────────────────────────────────────────

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
  static registerModel(
    key: string,
    inputPer1M: number,
    outputPer1M: number,
    cachePricing?: { cacheReadPer1M?: number; cacheWritePer1M?: number },
  ): void {
    if (!key || typeof key !== 'string') {
      throw new BudgetConfigError('registerModel: key must be a non-empty string');
    }
    if (!Number.isFinite(inputPer1M)  || inputPer1M  < 0) {
      throw new BudgetConfigError(`registerModel: inputPer1M must be >= 0, got: ${inputPer1M}`);
    }
    if (!Number.isFinite(outputPer1M) || outputPer1M < 0) {
      throw new BudgetConfigError(`registerModel: outputPer1M must be >= 0, got: ${outputPer1M}`);
    }
    const entry: import('./types.js').ModelPricing = { input: inputPer1M, output: outputPer1M };
    if (cachePricing?.cacheReadPer1M !== undefined)  entry.cacheRead  = cachePricing.cacheReadPer1M;
    if (cachePricing?.cacheWritePer1M !== undefined) entry.cacheWrite = cachePricing.cacheWritePer1M;
    globalRegistry[key] = entry;
  }

  /** Returns a snapshot of the global pricing registry. */
  static listModels(): PricingMap {
    return { ...globalRegistry };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private _buildSnapshot(): BudgetSnapshot {
    const usedUSD      = microToUsd(this._usedMicro);
    const remainingUSD = Math.max(0, this.limitUSD - usedUSD);
    const percentUsed  = parseFloat(((usedUSD / this.limitUSD) * 100).toFixed(4));

    return Object.freeze({
      usedUSD:               parseFloat(usedUSD.toFixed(8)),
      limitUSD:              this.limitUSD,
      remainingUSD:          parseFloat(remainingUSD.toFixed(8)),
      percentUsed,
      exceeded:              this.exceeded,
      warned:                this._warnFired,
      calls:                 this._calls.length,
      totalInputTokens:      this._totalInputTokens,
      totalOutputTokens:     this._totalOutputTokens,
      totalCacheReadTokens:  this._totalCacheReadTokens,
      totalCacheWriteTokens: this._totalCacheWriteTokens,
    });
  }
}
