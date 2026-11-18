# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- `estimate(usage, model?)` — the USD cost of a planned call, without tracking it
- `canAfford(usage, model?)` — whether a planned call fits in what's left, so the call that would cross the limit is caught before it's made

### Fixed
- OpenAI responses no longer bill cached prompt tokens twice. `prompt_tokens` already includes `prompt_tokens_details.cached_tokens`, so `wrap()` now tracks only the uncached part as input and the cached part as cache reads

## [1.0.0] — 2026-04-18

### Added
- `AgentBudget` class with full typed EventEmitter (`tick`, `warn`, `exceeded`, `reset`)
- `track(usage, model?, label?)` — manual call tracking with per-call labels
- `wrap(fn, model?, opts?)` — async LLM call wrapper with auto-extraction of Anthropic and OpenAI usage shapes
- `assertNotExceeded()` — pre-call guard that throws before spend happens
- `guardBefore` option on instance and per-`wrap()` call to prevent runaway spend
- BigInt microdollar arithmetic internally — eliminates float accumulation across thousands of calls
- O(1) `snapshot()` and O(distinct models) `breakdown()` — incremental running totals, no re-reduction on each call
- `throwOnExceeded` — `BudgetExceededError` includes both snapshot and the triggering `CallEntry`
- `warn` fires exactly once per budget cycle; resets with `.reset()`
- `exceeded` fires exactly once per budget cycle; resets with `.reset()`
- Instance-level pricing via `options.pricing` — does NOT mutate the global registry
- `AgentBudget.registerModel(key, inputPer1M, outputPer1M, cachePricing?)` — global registry with input validation
- `AgentBudget.listModels()` — returns a copy of the global pricing registry
- Dual ESM + CJS build with proper `exports` map and `types` field per condition
- Full TypeScript types: `BudgetSnapshot`, `CallEntry`, `ModelBreakdown`, `ModelPricing`, `BudgetEventMap`
- Named error classes: `BudgetExceededError`, `BudgetConfigError`, `UnknownModelError` — all with `code` discriminants
- Cache token pricing support for Anthropic (cache read / cache write) and OpenAI (cached prompt tokens)
- 40 tests covering construction, tracking, events, errors, immutability, float drift, reset cycles, and edge cases
- Built-in pricing for: Claude Opus/Sonnet/Haiku (Anthropic), GPT-4o/o1/o3/o4 (OpenAI), Gemini 2.0/1.5 (Google), Llama 3.x (Meta), Mistral Large/Small/Codestral
- Zero runtime dependencies
- Node.js ≥ 18 required (BigInt + ESM)
