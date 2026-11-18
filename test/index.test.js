/**
 * agent-budget test suite
 * Pure Node.js — no test framework needed.
 * Run: node test/index.test.js
 */

import assert from 'node:assert/strict';

// We test the source directly (pre-build) by importing via ts-node or after build.
// For simplicity, import the compiled ESM if built, or the source via tsx.
// This file is run after `npm run build`.
const { AgentBudget, BudgetExceededError, BudgetConfigError, UnknownModelError } =
  await import('../dist/esm/index.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const r = fn();
    if (r instanceof Promise) {
      r.then(() => { console.log(`  ✅ ${name}`); passed++; })
       .catch(e => { console.error(`  ❌ ${name}\n     ${e.message}`); failed++; });
    } else {
      console.log(`  ✅ ${name}`);
      passed++;
    }
  } catch (e) {
    console.error(`  ❌ ${name}\n     ${e.message}`);
    failed++;
  }
}

function assertClose(a, b, tol = 1e-9, msg = '') {
  assert(Math.abs(a - b) < tol, `${msg} expected ${b}, got ${a} (diff=${Math.abs(a-b)})`);
}

// ─── 1. Construction ───────────────────────────────────────────────────────────
console.log('\n── Construction ──');

test('default options', () => {
  const b = new AgentBudget();
  assert.equal(b.limitUSD, 1.00);
  assert.equal(b.warnAtPercent, 80);
  assert.equal(b.defaultModel, null);
  assert.equal(b.throwOnExceeded, false);
  assert.equal(b.guardBefore, false);
});

test('rejects limitUSD <= 0', () => {
  assert.throws(() => new AgentBudget({ limitUSD: 0 }), BudgetConfigError);
  assert.throws(() => new AgentBudget({ limitUSD: -5 }), BudgetConfigError);
});

test('rejects non-finite limitUSD', () => {
  assert.throws(() => new AgentBudget({ limitUSD: Infinity }), BudgetConfigError);
  assert.throws(() => new AgentBudget({ limitUSD: NaN }), BudgetConfigError);
});

test('rejects warnAtPercent out of range', () => {
  assert.throws(() => new AgentBudget({ warnAtPercent: -1 }), BudgetConfigError);
  assert.throws(() => new AgentBudget({ warnAtPercent: 101 }), BudgetConfigError);
});

// ─── 2. track() ────────────────────────────────────────────────────────────────
console.log('\n── track() ──');

test('basic cost calculation', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 10 });
  const snap = b.track({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
  // gpt-4o-mini: $0.15/M in, $0.60/M out → $0.75 total
  assertClose(snap.usedUSD, 0.75, 1e-7, 'cost');
  assert.equal(snap.calls, 1);
  assert.equal(snap.totalInputTokens, 1_000_000);
  assert.equal(snap.totalOutputTokens, 1_000_000);
});

test('throws on missing model', () => {
  const b = new AgentBudget({ limitUSD: 10 });
  assert.throws(() => b.track({ inputTokens: 100, outputTokens: 100 }), BudgetConfigError);
});

test('throws on unknown model', () => {
  const b = new AgentBudget({ limitUSD: 10 });
  assert.throws(() => b.track({ inputTokens: 100, outputTokens: 100 }, 'does-not-exist-v999'), UnknownModelError);
});

test('rejects negative tokens', () => {
  const b = new AgentBudget({ model: 'gpt-4o', limitUSD: 10 });
  assert.throws(() => b.track({ inputTokens: -1, outputTokens: 100 }), TypeError);
});

test('rejects NaN tokens', () => {
  const b = new AgentBudget({ model: 'gpt-4o', limitUSD: 10 });
  assert.throws(() => b.track({ inputTokens: NaN, outputTokens: 100 }), TypeError);
});

test('rejects fractional tokens', () => {
  const b = new AgentBudget({ model: 'gpt-4o', limitUSD: 10 });
  assert.throws(() => b.track({ inputTokens: 1.5, outputTokens: 100 }), TypeError);
});

test('returns frozen snapshot', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 10 });
  const snap = b.track({ inputTokens: 100, outputTokens: 100 });
  assert(Object.isFrozen(snap));
});

test('accumulates correctly across many calls (float drift check)', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 1000 });
  // 10k calls of 1 input token each — classic float drift scenario
  for (let i = 0; i < 10_000; i++) {
    b.track({ inputTokens: 1, outputTokens: 0 });
  }
  // Expected: 10_000 / 1_000_000 * 0.15 = $0.0015
  assertClose(b.usedUSD, 0.0015, 1e-9, 'accumulated cost after 10k calls');
});

test('labels are stored on call entries', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 10 });
  b.track({ inputTokens: 100, outputTokens: 50 }, undefined, 'my-step');
  assert.equal(b.log()[0].label, 'my-step');
});

// ─── 3. Events ────────────────────────────────────────────────────────────────
console.log('\n── Events ──');

test('tick fires on every call', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 10 });
  let ticks = 0;
  b.on('tick', () => ticks++);
  b.track({ inputTokens: 100, outputTokens: 100 });
  b.track({ inputTokens: 100, outputTokens: 100 });
  b.track({ inputTokens: 100, outputTokens: 100 });
  assert.equal(ticks, 3);
});

test('warn fires exactly once', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 0.001, warnAtPercent: 50 });
  let warns = 0;
  b.on('warn', () => warns++);
  for (let i = 0; i < 20; i++) b.track({ inputTokens: 10_000, outputTokens: 1_000 });
  assert.equal(warns, 1, `warn fired ${warns} times, expected 1`);
});

test('exceeded fires exactly once', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 0.00001 });
  let exceeded = 0;
  b.on('exceeded', () => exceeded++);
  for (let i = 0; i < 10; i++) {
    try { b.track({ inputTokens: 100_000, outputTokens: 100_000 }); } catch {}
  }
  assert.equal(exceeded, 1, `exceeded fired ${exceeded} times, expected 1`);
});

test('warn snapshot has warned=true', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 0.001, warnAtPercent: 10 });
  let warnSnap = null;
  b.on('warn', snap => { warnSnap = snap; });
  b.track({ inputTokens: 100_000, outputTokens: 10_000 });
  assert(warnSnap !== null);
  assert(warnSnap.warned === true);
});

test('.once() works', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 10 });
  let count = 0;
  b.once('tick', () => count++);
  b.track({ inputTokens: 100, outputTokens: 100 });
  b.track({ inputTokens: 100, outputTokens: 100 });
  assert.equal(count, 1);
});

test('.off() removes listener', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 10 });
  let count = 0;
  const fn = () => count++;
  b.on('tick', fn);
  b.track({ inputTokens: 100, outputTokens: 100 });
  b.off('tick', fn);
  b.track({ inputTokens: 100, outputTokens: 100 });
  assert.equal(count, 1);
});

test('reset emits reset event', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 10 });
  let fired = false;
  b.on('reset', () => { fired = true; });
  b.reset();
  assert(fired);
});

// ─── 4. throwOnExceeded ────────────────────────────────────────────────────────
console.log('\n── throwOnExceeded ──');

test('throws BudgetExceededError with correct shape', () => {
  const b = new AgentBudget({ model: 'gpt-4o', limitUSD: 0.000001, throwOnExceeded: true });
  assert.throws(
    () => b.track({ inputTokens: 10_000, outputTokens: 5_000 }),
    (err) => {
      assert(err instanceof BudgetExceededError);
      assert.equal(err.code, 'BUDGET_EXCEEDED');
      assert(err.snapshot !== undefined);
      assert(err.entry   !== undefined);
      return true;
    },
  );
});

test('call IS logged even when throwOnExceeded throws', () => {
  const b = new AgentBudget({ model: 'gpt-4o', limitUSD: 0.000001, throwOnExceeded: true });
  try { b.track({ inputTokens: 10_000, outputTokens: 5_000 }); } catch {}
  assert.equal(b.callCount, 1);
});

// ─── 5. assertNotExceeded ─────────────────────────────────────────────────────
console.log('\n── assertNotExceeded ──');

test('does not throw when under limit', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 10 });
  b.assertNotExceeded(); // should not throw
});

test('throws when over limit', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 0.000001 });
  try { b.track({ inputTokens: 100_000, outputTokens: 100_000 }); } catch {}
  assert.throws(() => b.assertNotExceeded(), BudgetExceededError);
});

// ─── 6. wrap() ────────────────────────────────────────────────────────────────
console.log('\n── wrap() ──');

test('extracts Anthropic shape', async () => {
  const b = new AgentBudget({ model: 'claude-sonnet-4-20250514', limitUSD: 10 });
  const fakeAnthropicResponse = {
    id: 'msg_123',
    usage: { input_tokens: 500, output_tokens: 200, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
  };
  await b.wrap(async () => fakeAnthropicResponse, 'claude-sonnet-4-20250514');
  assert.equal(b.callCount, 1);
  const entry = b.log()[0];
  assert.equal(entry.inputTokens, 500);
  assert.equal(entry.outputTokens, 200);
  assert.equal(entry.cacheReadTokens, 100);
});

test('extracts OpenAI shape', async () => {
  const b = new AgentBudget({ model: 'gpt-4o', limitUSD: 10 });
  const fakeOpenAIResponse = {
    id: 'chatcmpl_abc',
    usage: { prompt_tokens: 800, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 200 } },
  };
  await b.wrap(async () => fakeOpenAIResponse, 'gpt-4o');
  assert.equal(b.callCount, 1);
  const entry = b.log()[0];
  assert.equal(entry.inputTokens, 800);
  assert.equal(entry.outputTokens, 300);
  assert.equal(entry.cacheReadTokens, 200);
});

test('guardBefore prevents call when exceeded', async () => {
  const b = new AgentBudget({ model: 'gpt-4o', limitUSD: 0.000001, guardBefore: true });
  try { await b.wrap(async () => ({ usage: { prompt_tokens: 100_000, completion_tokens: 50_000 } })); } catch {}
  // Now budget is exceeded; next call should be blocked before fn() runs
  let fnCalled = false;
  await assert.rejects(
    () => b.wrap(async () => { fnCalled = true; return {}; }),
    BudgetExceededError,
  );
  assert.equal(fnCalled, false, 'fn should not have been called');
});

test('wrap passes label to entry', async () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 10 });
  const fakeResp = { usage: { prompt_tokens: 100, completion_tokens: 50 } };
  await b.wrap(async () => fakeResp, 'gpt-4o-mini', { label: 'classify-step' });
  assert.equal(b.log()[0].label, 'classify-step');
});

// ─── 7. breakdown() ───────────────────────────────────────────────────────────
console.log('\n── breakdown() ──');

test('breakdown is O(models) not O(calls)', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 1000 });
  for (let i = 0; i < 1000; i++) b.track({ inputTokens: 100, outputTokens: 50 });
  const bd = b.breakdown();
  assert.equal(Object.keys(bd).length, 1);
  assert.equal(bd['gpt-4o-mini'].calls, 1000);
});

test('breakdown sharePercent sums to ~100', () => {
  const b = new AgentBudget({ limitUSD: 100 });
  b.track({ inputTokens: 100_000, outputTokens: 50_000 }, 'gpt-4o');
  b.track({ inputTokens: 100_000, outputTokens: 50_000 }, 'gpt-4o-mini');
  b.track({ inputTokens: 100_000, outputTokens: 50_000 }, 'claude-sonnet-4-20250514');
  const bd = b.breakdown();
  const total = Object.values(bd).reduce((s, v) => s + v.sharePercent, 0);
  assertClose(total, 100, 0.1, 'sharePercent sum');
});

// ─── 8. log() immutability ────────────────────────────────────────────────────
console.log('\n── log() immutability ──');

test('log() returns a copy — mutating it does not affect internal state', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 10 });
  b.track({ inputTokens: 100, outputTokens: 50 });
  const log = b.log();
  log.splice(0, 1); // remove entry from returned array
  assert.equal(b.log().length, 1, 'internal call log should be unaffected');
});

test('call entries are frozen', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 10 });
  b.track({ inputTokens: 100, outputTokens: 50 });
  const entry = b.log()[0];
  assert(Object.isFrozen(entry));
});

// ─── 9. reset() ───────────────────────────────────────────────────────────────
console.log('\n── reset() ──');

test('reset clears all state', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 10 });
  b.track({ inputTokens: 100_000, outputTokens: 50_000 });
  b.reset();
  const snap = b.snapshot();
  assert.equal(snap.usedUSD, 0);
  assert.equal(snap.calls, 0);
  assert.equal(snap.totalInputTokens, 0);
  assert.equal(snap.exceeded, false);
  assert.equal(snap.warned, false);
  assert.deepEqual(b.breakdown(), {});
});

test('warn fires again after reset', () => {
  const b = new AgentBudget({ model: 'gpt-4o-mini', limitUSD: 0.001, warnAtPercent: 10 });
  let warns = 0;
  b.on('warn', () => warns++);
  b.track({ inputTokens: 500_000, outputTokens: 50_000 });
  b.reset();
  b.track({ inputTokens: 500_000, outputTokens: 50_000 });
  assert.equal(warns, 2, `Expected 2 warn events (one per cycle), got ${warns}`);
});

// ─── 10. Instance pricing ─────────────────────────────────────────────────────
console.log('\n── Instance pricing override ──');

test('instance pricing does not mutate global registry', () => {
  const customPricing = { 'my-private-model': { input: 0.00, output: 0.00 } };
  const b = new AgentBudget({ limitUSD: 10, pricing: customPricing });
  b.track({ inputTokens: 100_000, outputTokens: 100_000 }, 'my-private-model');
  assert.equal(b.usedUSD, 0); // free model

  // Another instance without the override should NOT know about this model
  const b2 = new AgentBudget({ limitUSD: 10 });
  assert.throws(() => b2.track({ inputTokens: 100, outputTokens: 100 }, 'my-private-model'), UnknownModelError);
});

test('instance pricing merges with global (can still use built-ins)', () => {
  const b = new AgentBudget({
    limitUSD: 10,
    pricing: { 'my-local-llm': { input: 0.00, output: 0.00 } },
  });
  b.track({ inputTokens: 100, outputTokens: 100 }, 'gpt-4o-mini'); // built-in still works
  b.track({ inputTokens: 100, outputTokens: 100 }, 'my-local-llm');
  assert.equal(b.callCount, 2);
});

// ─── 11. registerModel() ──────────────────────────────────────────────────────
console.log('\n── AgentBudget.registerModel() ──');

test('registered model is available globally', () => {
  AgentBudget.registerModel('test-global-model', 1.00, 2.00);
  const b = new AgentBudget({ limitUSD: 10 });
  b.track({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, 'test-global-model');
  assertClose(b.usedUSD, 3.00, 1e-6, 'global model cost');
});

test('registerModel validates inputs', () => {
  assert.throws(() => AgentBudget.registerModel('', 1, 1), BudgetConfigError);
  assert.throws(() => AgentBudget.registerModel('x', -1, 1), BudgetConfigError);
  assert.throws(() => AgentBudget.registerModel('x', 1, -1), BudgetConfigError);
});

// ─── 12. snapshot() zero-limit guard ─────────────────────────────────────────
console.log('\n── Edge cases ──');

test('snapshot percentUsed does not produce Infinity or NaN', () => {
  // limitUSD validation prevents 0, but let's test normal small limits
  const b = new AgentBudget({ limitUSD: 0.000001, model: 'gpt-4o-mini' });
  const snap = b.snapshot();
  assert(Number.isFinite(snap.percentUsed));
  assert(!Number.isNaN(snap.percentUsed));
});

test('zero-token call is valid and costs $0', () => {
  const b = new AgentBudget({ model: 'gpt-4o', limitUSD: 10 });
  const snap = b.track({ inputTokens: 0, outputTokens: 0 });
  assert.equal(snap.usedUSD, 0);
  assert.equal(snap.calls, 1);
});

// ─── Before a call: estimate and canAfford ──
console.log('\n── Estimate and canAfford ──');

test('estimate prices a call without tracking it', () => {
  const b = new AgentBudget({ model: 'gpt-4o', limitUSD: 10 });
  assertClose(b.estimate({ inputTokens: 1_000_000, outputTokens: 100_000 }), 3.5);
  assert.equal(b.callCount, 0);
  assert.equal(b.usedUSD, 0);
});

test('canAfford catches the call that would push past the limit', () => {
  const b = new AgentBudget({ model: 'gpt-4o', limitUSD: 5 });
  b.track({ inputTokens: 1_000_000, outputTokens: 0 });            // $2.50 used
  assert.equal(b.exceeded, false);
  assert.equal(b.canAfford({ inputTokens: 1_000_000, outputTokens: 0 }), true);   // exactly $5.00: fits
  assert.equal(b.canAfford({ inputTokens: 1_000_000, outputTokens: 1 }), false);  // a hair over: doesn't
});

test('estimate and canAfford need a model and a known one', () => {
  const b = new AgentBudget({ limitUSD: 1 });
  assert.throws(() => b.estimate({ inputTokens: 1, outputTokens: 1 }), BudgetConfigError);
  assert.throws(() => b.canAfford({ inputTokens: 1, outputTokens: 1 }, 'no-such-model'), UnknownModelError);
});

// ─── Summary ──────────────────────────────────────────────────────────────────
// Give async tests time to settle
await new Promise(r => setTimeout(r, 100));

console.log(`\n${'─'.repeat(50)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
console.log(`${'─'.repeat(50)}\n`);

if (failed > 0) process.exit(1);
