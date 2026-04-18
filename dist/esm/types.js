// ─── Pricing ──────────────────────────────────────────────────────────────────
// ─── Errors ───────────────────────────────────────────────────────────────────
export class BudgetExceededError extends Error {
    constructor(snapshot, entry) {
        super(`[agent-budget] Budget exceeded: $${snapshot.usedUSD.toFixed(6)} of $${snapshot.limitUSD.toFixed(4)} limit`);
        this.snapshot = snapshot;
        this.entry = entry;
        this.code = 'BUDGET_EXCEEDED';
        this.name = 'BudgetExceededError';
        Object.setPrototypeOf(this, BudgetExceededError.prototype);
    }
}
export class BudgetConfigError extends Error {
    constructor(message) {
        super(`[agent-budget] ${message}`);
        this.code = 'BUDGET_CONFIG_ERROR';
        this.name = 'BudgetConfigError';
        Object.setPrototypeOf(this, BudgetConfigError.prototype);
    }
}
export class UnknownModelError extends Error {
    constructor(model) {
        super(`[agent-budget] Unknown model "${model}". Register it with AgentBudget.registerModel() or pass pricing: {} in options.`);
        this.model = model;
        this.code = 'UNKNOWN_MODEL';
        this.name = 'UnknownModelError';
        Object.setPrototypeOf(this, UnknownModelError.prototype);
    }
}
//# sourceMappingURL=types.js.map