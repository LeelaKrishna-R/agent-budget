// ─── Pricing ──────────────────────────────────────────────────────────────────

export interface ModelPricing {
  /** Cost per 1M input tokens in USD */
  input: number;
  /** Cost per 1M output tokens in USD */
  output: number;
  /** Optional: cost per 1M cached-read tokens (e.g. Anthropic prompt caching) */
  cacheRead?: number | undefined;
  /** Optional: cost per 1M cached-write tokens */
  cacheWrite?: number | undefined;
  /** Optional: cost per 1M 1-hour cached-write tokens (defaults to 2x input, Anthropic's 1-hour rate) */
  cacheWrite1h?: number | undefined;
}

export type PricingMap = Record<string, ModelPricing>;

// ─── Usage ────────────────────────────────────────────────────────────────────

export interface UsageInput {
  inputTokens: number;
  outputTokens: number;
  /** Cached tokens read (counts toward input cost at reduced rate) */
  cacheReadTokens?: number;
  /** Cached tokens written */
  cacheWriteTokens?: number;
  /** The part of cacheWriteTokens written with a 1-hour TTL (Anthropic bills these at 2x input, not 1.25x) */
  cacheWrite1hTokens?: number;
}

// ─── Call log entry ───────────────────────────────────────────────────────────

export interface CallEntry {
  readonly id: number;
  readonly ts: number;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  /** Cost in microdollars (integer). Divide by 1e10 for USD. */
  readonly costMicro: bigint;
  /** Convenience: cost in USD (derived from costMicro) */
  readonly costUSD: number;
  /** Optional caller-supplied label for this call */
  readonly label?: string | undefined;
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export interface BudgetSnapshot {
  readonly usedUSD: number;
  readonly limitUSD: number;
  readonly remainingUSD: number;
  readonly percentUsed: number;
  readonly exceeded: boolean;
  readonly warned: boolean;
  readonly calls: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCacheReadTokens: number;
  readonly totalCacheWriteTokens: number;
}

// ─── Per-model breakdown ──────────────────────────────────────────────────────

export interface ModelStats {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUSD: number;
  sharePercent: number;
}

export type ModelBreakdown = Record<string, ModelStats>;

// ─── Events ───────────────────────────────────────────────────────────────────

export type BudgetEventMap = {
  tick:     [snap: BudgetSnapshot, entry: CallEntry];
  warn:     [snap: BudgetSnapshot];
  exceeded: [snap: BudgetSnapshot];
  reset:    [];
};

// ─── Options ──────────────────────────────────────────────────────────────────

export interface AgentBudgetOptions {
  /**
   * Hard spend limit in USD.
   * Must be a positive finite number.
   * @default 1.00
   */
  limitUSD?: number;

  /**
   * Percentage of budget at which the 'warn' event fires (0–100).
   * @default 80
   */
  warnAtPercent?: number;

  /**
   * Default model key used when .track() / .wrap() are called without an explicit model.
   */
  model?: string;

  /**
   * If true, .track() throws a BudgetExceededError when the limit is hit.
   * The throw happens AFTER the call is logged (the call already happened).
   * Use .assertNotExceeded() BEFORE a call to prevent it from running.
   * @default false
   */
  throwOnExceeded?: boolean;

  /**
   * If true, .wrap() calls .assertNotExceeded() before invoking fn,
   * preventing the LLM call entirely when budget is already exceeded.
   * @default false
   */
  guardBefore?: boolean;

  /**
   * Override or extend the built-in pricing table for this instance only.
   * Does NOT mutate the global table.
   */
  pricing?: PricingMap;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class BudgetExceededError extends Error {
  readonly code = 'BUDGET_EXCEEDED' as const;
  constructor(
    public readonly snapshot: BudgetSnapshot,
    public readonly entry?: CallEntry,
  ) {
    super(
      `[agent-budget] Budget exceeded: $${snapshot.usedUSD.toFixed(6)} of $${snapshot.limitUSD.toFixed(4)} limit`,
    );
    this.name = 'BudgetExceededError';
    Object.setPrototypeOf(this, BudgetExceededError.prototype);
  }
}

export class BudgetConfigError extends Error {
  readonly code = 'BUDGET_CONFIG_ERROR' as const;
  constructor(message: string) {
    super(`[agent-budget] ${message}`);
    this.name = 'BudgetConfigError';
    Object.setPrototypeOf(this, BudgetConfigError.prototype);
  }
}

export class UnknownModelError extends Error {
  readonly code = 'UNKNOWN_MODEL' as const;
  constructor(public readonly model: string) {
    super(
      `[agent-budget] Unknown model "${model}". Register it with AgentBudget.registerModel() or pass pricing: {} in options.`,
    );
    this.name = 'UnknownModelError';
    Object.setPrototypeOf(this, UnknownModelError.prototype);
  }
}
