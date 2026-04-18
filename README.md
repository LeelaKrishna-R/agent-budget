# agent-budget

**Token budget and cost tracking middleware for LLM-powered AI agents.**

Zero dependencies. Works with Anthropic, OpenAI, Google Gemini, Mistral, and any custom model. Dual ESM + CJS. Full TypeScript types.

```
npm install agent-budget
```

---

## Why

LLM agents chain dozens to hundreds of calls. Without guardrails, a runaway loop or a misconfigured retry policy can burn through dollars in seconds. `agent-budget` gives you:

- **Accurate cost tracking** — BigInt microdollar arithmetic, no float drift across thousands of calls
- **Real events** — a typed EventEmitter with `tick`, `warn`, `exceeded`, and `reset`
- **Pre-call guards** — stop spending before the call, not after
- **Zero overhead** — O(1) snapshot, O(distinct models) breakdown, incremental running totals

---

## Quick start

```ts
import { AgentBudget } from 'agent-budget';

const budget = new AgentBudget({
  limitUSD: 0.50,
  warnAtPercent: 80,
  model: 'claude-sonnet-4-20250514',
  guardBefore: true,       // block calls when already exceeded
  throwOnExceeded: false,  // emit event instead of throwing
});

budget.on('warn',     snap => console.warn(`⚠ Budget at ${snap.percentUsed.toFixed(1)}%`));
budget.on('exceeded', snap => console.error(`✗ Budget exceeded: $${snap.usedUSD}`));
budget.on('tick',     (snap, entry) => console.log(`call #${entry.id} cost $${entry.costUSD.toFixed(6)}`));
```

---

## Tracking calls

### Option A — wrap (recommended)

Auto-extracts token usage from Anthropic and OpenAI response shapes:

```ts
const response = await budget.wrap(
  () => anthropic.messages.create({ model: 'claude-sonnet-4-20250514', ... }),
  'claude-sonnet-4-20250514',
  { label: 'summarize-step' },
);
```

### Option B — track manually

```ts
const response = await anthropic.messages.create({ ... });

budget.track(
  {
    inputTokens:      response.usage.input_tokens,
    outputTokens:     response.usage.output_tokens,
    cacheReadTokens:  response.usage.cache_read_input_tokens,   // optional
    cacheWriteTokens: response.usage.cache_creation_input_tokens, // optional
  },
  'claude-sonnet-4-20250514',
  'summarize-step', // optional label
);
```

### Guard before spending

Call this before any expensive step to hard-stop when the budget is already blown:

```ts
budget.assertNotExceeded(); // throws BudgetExceededError if exceeded
const response = await llm.call(...);
budget.track(response.usage, model);
```

Or enable it globally for all `.wrap()` calls:

```ts
const budget = new AgentBudget({ guardBefore: true, ... });
// Every budget.wrap() will assertNotExceeded() before invoking fn
```

---

## Inspection

```ts
budget.snapshot();
// {
//   usedUSD: 0.00412,
//   limitUSD: 0.5,
//   remainingUSD: 0.49588,
//   percentUsed: 0.824,
//   exceeded: false,
//   warned: false,
//   calls: 3,
//   totalInputTokens: 12400,
//   totalOutputTokens: 3100,
//   totalCacheReadTokens: 800,
//   totalCacheWriteTokens: 0,
// }

budget.breakdown();
// {
//   'claude-sonnet-4-20250514': {
//     calls: 2, inputTokens: 8000, outputTokens: 2000,
//     cacheReadTokens: 800, cacheWriteTokens: 0,
//     costUSD: 0.0066, sharePercent: 76.38,
//   },
//   'gpt-4o-mini': {
//     calls: 1, inputTokens: 4400, outputTokens: 1100,
//     cacheReadTokens: 0, cacheWriteTokens: 0,
//     costUSD: 0.00132, sharePercent: 23.62,
//   },
// }

budget.log();   // readonly CallEntry[] — deep-copied, frozen entries
budget.reset(); // clears all state, emits 'reset', warn/exceeded can fire again
```

---

## Events

`AgentBudget` extends a typed EventEmitter. All four events are real — not stub constants.

```ts
budget.on('tick',     (snapshot, entry) => { /* fires after every tracked call */ });
budget.on('warn',     (snapshot)        => { /* fires once when warnAtPercent crossed */ });
budget.on('exceeded', (snapshot)        => { /* fires once when limitUSD crossed */ });
budget.on('reset',    ()                => { /* fires on .reset() */ });

// warn and exceeded fire again after .reset(), one time each per cycle

budget.once('exceeded', snap => notifySlack(snap));
budget.off('tick', myListener);
budget.removeAllListeners('tick');
budget.listenerCount('tick'); // number
```

---

## Constructor options

| Option | Type | Default | Description |
|---|---|---|---|
| `limitUSD` | `number` | `1.00` | Hard spend limit. Must be a positive finite number. |
| `warnAtPercent` | `number` | `80` | Percent of budget at which `warn` fires (0–100). |
| `model` | `string` | — | Default model key. Required if not passed per-call. |
| `throwOnExceeded` | `boolean` | `false` | Throw `BudgetExceededError` when limit hit. |
| `guardBefore` | `boolean` | `false` | Call `assertNotExceeded()` before every `.wrap()`. |
| `pricing` | `PricingMap` | — | Instance-only overrides. Does **not** mutate the global table. |

---

## Custom and local models

**Instance-level** (isolated — recommended):

```ts
const budget = new AgentBudget({
  limitUSD: 100,
  pricing: {
    'my-fine-tuned-model': { input: 0.50, output: 2.00 },
    'local-llama':          { input: 0.00, output: 0.00 }, // self-hosted
  },
});
```

**Global registry** (affects all future instances):

```ts
AgentBudget.registerModel(
  'my-new-model',
  0.80,   // input per 1M tokens
  3.20,   // output per 1M tokens
  { cacheReadPer1M: 0.08, cacheWritePer1M: 1.00 }, // optional
);

AgentBudget.listModels(); // { ...all registered models }
```

---

## Error types

All errors are named classes with a `code` discriminant for reliable `catch` narrowing:

```ts
import { BudgetExceededError, BudgetConfigError, UnknownModelError } from 'agent-budget';

try {
  budget.assertNotExceeded();
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.log(err.code);      // 'BUDGET_EXCEEDED'
    console.log(err.snapshot);  // BudgetSnapshot at time of throw
    console.log(err.entry);     // CallEntry that triggered it (undefined for assertNotExceeded)
  }
}
```

| Class | `code` | When |
|---|---|---|
| `BudgetExceededError` | `BUDGET_EXCEEDED` | `.assertNotExceeded()` or `throwOnExceeded: true` |
| `BudgetConfigError` | `BUDGET_CONFIG_ERROR` | Bad constructor options or `registerModel` args |
| `UnknownModelError` | `UNKNOWN_MODEL` | Model key not in pricing map |

---

## Built-in models

Pricing is per 1M tokens (USD), verified April 2026.

| Provider | Model | Input | Output |
|---|---|---|---|
| Anthropic | `claude-opus-4-20250514` | $15.00 | $75.00 |
| Anthropic | `claude-sonnet-4-20250514` | $3.00 | $15.00 |
| Anthropic | `claude-haiku-4-5-20251001` | $0.80 | $4.00 |
| OpenAI | `gpt-4o` | $2.50 | $10.00 |
| OpenAI | `gpt-4o-mini` | $0.15 | $0.60 |
| OpenAI | `o1` | $15.00 | $60.00 |
| OpenAI | `o3` | $10.00 | $40.00 |
| OpenAI | `o3-mini` / `o4-mini` | $1.10 | $4.40 |
| Google | `gemini-2.0-flash` | $0.10 | $0.40 |
| Google | `gemini-1.5-pro` | $1.25 | $5.00 |
| Mistral | `mistral-large-latest` | $2.00 | $6.00 |
| Mistral | `codestral-latest` | $0.20 | $0.60 |
| Meta (hosted) | `llama-3.3-70b` | $0.59 | $0.79 |

Anthropic models include cache read/write pricing. OpenAI models extract cached prompt tokens from `usage.prompt_tokens_details.cached_tokens`.

Use `AgentBudget.listModels()` for the full list.

---

## Multi-agent example

```ts
import { AgentBudget } from 'agent-budget';

// Shared budget across an agent pipeline
const budget = new AgentBudget({ limitUSD: 2.00, warnAtPercent: 75 });

budget.on('warn', snap =>
  console.warn(`Pipeline at ${snap.percentUsed.toFixed(1)}% — ${snap.calls} calls made`));

budget.on('exceeded', snap => {
  console.error('Pipeline budget exhausted. Halting.');
  process.exit(1);
});

async function runPipeline(input: string) {
  const plan = await budget.wrap(
    () => llm.call({ prompt: `Plan: ${input}`, model: 'gpt-4o-mini' }),
    'gpt-4o-mini',
    { label: 'plan' },
  );

  budget.assertNotExceeded();

  const result = await budget.wrap(
    () => llm.call({ prompt: `Execute: ${plan}`, model: 'claude-sonnet-4-20250514' }),
    'claude-sonnet-4-20250514',
    { label: 'execute' },
  );

  console.log('Final cost:', budget.snapshot().usedUSD.toFixed(6));
  console.log('Breakdown:', budget.breakdown());
  return result;
}
```

---

## Implementation notes

**Why BigInt for money?** IEEE 754 float accumulation is real. After 10,000 calls of `$0.00015`, naive float addition gives `$1.5000000000000231`. BigInt microdollar arithmetic (1 USD = 10^10 microdollars) eliminates this entirely. Conversion to USD float only happens at display time.

**Why no fuzzy model matching?** The original version matched `'claude'` to `'claude-opus-4-20250514'` silently. Fuzzy matching on financial lookups is a footgun — a typo in a model name should throw `UnknownModelError`, not silently assign you the wrong pricing tier.

**Why instance-level pricing instead of global mutation?** Two agent instances in the same process shouldn't share mutable state. `options.pricing` merges with the global registry at construction time and stays private to that instance.

---

## License

MIT
