// Runs the agent in the terminal against the seeded workspace.
//   npm run agent                 -> summary of all seeded disputes
//   npm run agent -- PP-D-100012  -> full reasoning log for one dispute
// Uses the model when OPENROUTER_API_KEY and OPENROUTER_MODEL are set, otherwise the rules engine.
import { runAgent, type DataSource } from "../src/worker/agent";
import { seedWorkspace } from "../src/worker/seed";

const data = seedWorkspace(Date.now());
const src: DataSource = {
  listDisputes: async () => data.disputes,
  getDispute: async (id) => data.disputes.find((d) => d.id === id) ?? null,
  getTransaction: async (id) => data.transactions.find((t) => t.id === id) ?? null,
  searchTransactions: async (email) => data.transactions.filter((t) => t.buyer.email === email),
};
const key = process.env.OPENROUTER_API_KEY;
const model = key && process.env.OPENROUTER_MODEL ? { key, name: process.env.OPENROUTER_MODEL } : undefined;
const target = process.argv[2];

if (target) {
  const c = await runAgent(src, target, { model, emit: (s) => console.log(`\n[${s.i}] ${s.kind.toUpperCase()} ${s.title}${s.ms != null ? ` (${s.ms}ms)` : ""}\n${s.reasoning ? "  why: " + s.reasoning + "\n" : ""}${s.output ? "  → " + s.output : ""}`) });
  console.log(`\n--- ENGINE ---\n${c.engine.kind === "model" ? c.engine.model : "rules"}`);
  console.log("\n--- DRAFT ---\n" + c.draft.notes);
  console.log("\n--- EVIDENCE (PayPal provide-evidence) ---\n" + JSON.stringify(c.draft.evidences, null, 2));
  console.log("\n--- GAPS ---\n" + (c.draft.gaps.join("\n") || "none"));
} else {
  const tally: Record<string, number> = {};
  for (const d of data.disputes) {
    const c = await runAgent(src, d.id, {});
    tally[c.assessment.verdict] = (tally[c.assessment.verdict] ?? 0) + 1;
    console.log(`${d.id}  ${d.reason.padEnd(40)} ${String(d.amount.value).padStart(7)}  ${c.assessment.verdict.padEnd(8)} ${String(c.assessment.score).padStart(3)}  fact-check:${c.draft.factCheck.passed ? "ok" : "FAIL " + c.draft.factCheck.unverified.join(",")}`);
  }
  console.log(tally);
}
