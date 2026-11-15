// The demo in the README: an agent with a $0.50 budget makes calls until the
// budget runs out, and the guard refuses the next one before it is sent.
// The "model" is a stand-in that returns Anthropic-shaped usage, so this runs
// offline and costs nothing:  node docs/demo/demo.mjs
import { AgentBudget, BudgetExceededError } from "../../dist/esm/index.js";

const budget = new AgentBudget({
  limitUSD: 0.5,
  warnAtPercent: 80,
  model: "claude-sonnet-4-20250514",
  guardBefore: true,
});

budget.on("tick", (snap, entry) =>
  console.log(`call ${entry.id}  ${entry.label.padEnd(7)} $${entry.costUSD.toFixed(2)}   total $${snap.usedUSD.toFixed(2)} of $0.50`),
);
budget.on("warn", (snap) => console.log(`warn    budget at ${snap.percentUsed.toFixed(0)}%`));
budget.on("exceeded", () => console.log("limit   $0.50 reached"));

// [label, input tokens, output tokens] per step, priced at $3 / $15 per million.
const steps = [
  ["plan", 25_000, 3_000],
  ["search", 30_000, 4_000],
  ["read", 26_000, 3_467],
  ["draft", 20_000, 2_667],
  ["revise", 18_000, 2_000],
];

for (const [label, input_tokens, output_tokens] of steps) {
  try {
    await budget.wrap(async () => ({ usage: { input_tokens, output_tokens } }), undefined, { label });
  } catch (err) {
    if (!(err instanceof BudgetExceededError)) throw err;
    console.log(`refused ${label}: the budget is spent, so the call was never sent`);
    break;
  }
}
