import type { PricingMap } from './types.js';
import { UnknownModelError } from './types.js';

/**
 * Built-in pricing table (USD per 1M tokens).
 * Sources: official provider pricing pages — last verified April 2026.
 * This is a readonly baseline. Override per-instance via AgentBudgetOptions.pricing.
 * Add new models globally via AgentBudget.registerModel().
 */
export const BUILTIN_PRICING: Readonly<PricingMap> = Object.freeze({
  // ── Anthropic ──────────────────────────────────────────────────────────────
  'claude-opus-4-20250514':       { input: 15.00,  output: 75.00,  cacheRead: 1.50,  cacheWrite: 18.75 },
  'claude-sonnet-4-20250514':     { input: 3.00,   output: 15.00,  cacheRead: 0.30,  cacheWrite: 3.75  },
  'claude-haiku-4-5-20251001':    { input: 1.00,   output: 5.00,   cacheRead: 0.10,  cacheWrite: 1.25  },
  'claude-3-5-sonnet-20241022':   { input: 3.00,   output: 15.00,  cacheRead: 0.30,  cacheWrite: 3.75  },
  'claude-3-5-haiku-20241022':    { input: 0.80,   output: 4.00,   cacheRead: 0.08,  cacheWrite: 1.00  },
  'claude-3-opus-20240229':       { input: 15.00,  output: 75.00,  cacheRead: 1.50,  cacheWrite: 18.75 },
  // ── OpenAI ────────────────────────────────────────────────────────────────
  'gpt-4o':                       { input: 2.50,   output: 10.00  },
  'gpt-4o-mini':                  { input: 0.15,   output: 0.60   },
  'gpt-4-turbo':                  { input: 10.00,  output: 30.00  },
  'o1':                           { input: 15.00,  output: 60.00  },
  'o1-mini':                      { input: 1.10,   output: 4.40   },
  'o3':                           { input: 10.00,  output: 40.00  },
  'o3-mini':                      { input: 1.10,   output: 4.40   },
  'o4-mini':                      { input: 1.10,   output: 4.40   },
  // ── Google ────────────────────────────────────────────────────────────────
  'gemini-2.0-flash':             { input: 0.10,   output: 0.40   },
  'gemini-2.0-flash-lite':        { input: 0.075,  output: 0.30   },
  'gemini-1.5-pro':               { input: 1.25,   output: 5.00   },
  'gemini-1.5-flash':             { input: 0.075,  output: 0.30   },
  // ── Meta / OSS ────────────────────────────────────────────────────────────
  'llama-3.3-70b':                { input: 0.59,   output: 0.79   },
  'llama-3.1-8b':                 { input: 0.18,   output: 0.18   },
  // ── Mistral ───────────────────────────────────────────────────────────────
  'mistral-large-latest':         { input: 2.00,   output: 6.00   },
  'mistral-small-latest':         { input: 0.10,   output: 0.30   },
  'codestral-latest':             { input: 0.20,   output: 0.60   },
});

/**
 * Global registry — extended via AgentBudget.registerModel().
 * Separate from BUILTIN_PRICING so overrides are detectable.
 */
export const globalRegistry: PricingMap = { ...BUILTIN_PRICING };

/**
 * Exact-key resolution only — no fuzzy matching.
 * Fuzzy matching on financial data is a footgun.
 */
export function resolvePricing(model: string, map: PricingMap) {
  const entry = map[model];
  if (entry !== undefined) return entry;
  throw new UnknownModelError(model);
}
