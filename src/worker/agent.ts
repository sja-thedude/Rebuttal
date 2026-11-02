import { PLAYBOOK } from "../shared/playbook";
import type { AgentStep, Assessment, CaseFile, Dispute, Draft, Transaction } from "../shared/types";
import { assessEvidence, requirementsFor } from "./assess";
import { buildEvidences, factCheck, gapsFor, rulesDraft } from "./draft";
import { chat, type ChatMessage, type ToolDef } from "./openrouter";

export interface DataSource {
  listDisputes(): Promise<Dispute[]>;
  getDispute(id: string): Promise<Dispute | null>;
  getTransaction(id: string, around: string): Promise<Transaction | null>;
  searchTransactions(email: string, around: string): Promise<Transaction[]>;
}

export interface RunOptions {
  model?: { key: string; name: string };
  emit?: (step: AgentStep) => void | Promise<void>;
  /** Milliseconds between steps when a person is watching the run live. */
  pace?: number;
}

const MAX_TURNS = 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const day = (s: string) => s.slice(0, 10);

class Run {
  log: AgentStep[] = [];
  dispute: Dispute | null = null;
  tx: Transaction | null = null;
  history: Transaction[] = [];
  assessment: Assessment | null = null;
  draft: Draft | null = null;

  constructor(private src: DataSource, private id: string, private opts: RunOptions) {}

  async step(s: Omit<AgentStep, "i" | "at">) {
    const step: AgentStep = { i: this.log.length + 1, at: new Date().toISOString(), ...s };
    this.log.push(step);
    await this.opts.emit?.(step);
    if (this.opts.pace) await sleep(this.opts.pace);
  }

  async tool(name: string, args: Record<string, unknown>, reasoning?: string): Promise<{ result: unknown; summary: string }> {
    const t0 = Date.now();
    let result: unknown;
    let summary: string;
    try {
      ({ result, summary } = await this.exec(name, args));
    } catch (e) {
      result = { error: (e as Error).message };
      summary = `Failed: ${(e as Error).message}`;
    }
    await this.step({ kind: "tool", tool: name, args, title: toolTitle(name, args), reasoning, output: summary, ms: Date.now() - t0 });
    return { result, summary };
  }

  private async exec(name: string, args: Record<string, unknown>): Promise<{ result: unknown; summary: string }> {
    switch (name) {
      case "list_disputes": {
        const all = await this.src.listDisputes();
        const rows = all.map((d) => ({ id: d.id, reason: d.reason, amount: d.amount, due: d.responseDueAt }));
        const urgent = rows.filter((r) => Date.parse(r.due) - Date.now() < 48 * 3600_000).length;
        return { result: rows.slice(0, 60), summary: `${rows.length} open disputes, ${urgent} due within 48 hours.` };
      }
      case "get_dispute": {
        const d = await this.src.getDispute(String(args.id ?? this.id));
        if (!d) throw new Error("Dispute not found");
        this.dispute = d;
        return { result: d, summary: `${PLAYBOOK[d.reason].label}, ${d.amount.currency} ${d.amount.value.toFixed(2)}, ${d.stage.toLowerCase()} stage, response due ${day(d.responseDueAt)}. Buyer says: "${d.buyerClaim}"` };
      }
      case "get_transaction": {
        const d = this.dispute ?? (await this.src.getDispute(this.id));
        const tx = await this.src.getTransaction(String(args.id ?? d?.transactionId), d?.createdAt ?? new Date().toISOString());
        this.tx = tx;
        if (!tx) return { result: { error: "Transaction not found in the record" }, summary: "Transaction not found in the record." };
        const ship = tx.shipment ? `${tx.shipment.carrier}, ${tx.shipment.status.replace(/_/g, " ")}` : tx.fulfilment === "digital" ? "digital delivery" : tx.fulfilment;
        return { result: tx, summary: `Invoice ${tx.invoiceId} on ${day(tx.date)}: ${tx.items.filter((i) => i.sku !== "SHIP").map((i) => `${i.quantity}× ${i.name}`).join(", ")}. Fulfilment: ${ship}. ${tx.messages.length} message(s), ${tx.refunds.length} refund(s).` };
      }
      case "search_transactions": {
        const email = String(args.buyer_email ?? this.dispute?.buyer.email ?? "");
        const rows = await this.src.searchTransactions(email, this.dispute?.createdAt ?? new Date().toISOString());
        this.history = rows;
        const others = rows.filter((r) => r.id !== (this.tx?.id ?? this.dispute?.transactionId));
        return {
          result: others.map((r) => ({ id: r.id, invoiceId: r.invoiceId, date: r.date, amount: r.amount, items: r.items.map((i) => i.name), deviceId: r.risk?.deviceId, note: r.note })),
          summary: others.length ? `${others.length} other transaction(s) from ${email}: ${others.map((o) => `${o.invoiceId} (${day(o.date)})`).join(", ")}.` : `No other transactions from ${email}.`,
        };
      }
      case "assess_evidence": {
        if (!this.dispute) this.dispute = await this.src.getDispute(this.id);
        if (!this.dispute) throw new Error("Dispute not found");
        const a = assessEvidence(this.dispute, this.tx, this.history);
        this.assessment = a;
        const found = a.items.filter((i) => i.status === "found").length;
        const counted = a.items.filter((i) => i.status !== "not_needed").length;
        return {
          result: { verdict: a.verdict, score: a.score, rationale: a.rationale, evidence: a.items.map((i) => ({ key: i.key, label: i.label, status: i.status, detail: i.detail, critical: i.critical })) },
          summary: `${found} of ${counted} evidence items found. Score ${a.score}/100: ${a.verdict}.`,
        };
      }
      case "draft_response": {
        if (!this.dispute || !this.assessment) throw new Error("Call assess_evidence before drafting");
        const notes = String(args.notes ?? "").trim();
        const cites = Array.isArray(args.cites) ? (args.cites as unknown[]).map(String) : [];
        const usable = new Set(this.assessment.items.filter((i) => i.status === "found" || i.status === "partial").map((i) => i.key));
        const bad = cites.filter((c) => !usable.has(c));
        const check = factCheck(notes, this.dispute, this.tx, this.history);
        const problems: string[] = [];
        if (!notes) problems.push("notes are empty");
        if (notes.length > 2000) problems.push(`notes are ${notes.length} characters; PayPal accepts 2000`);
        if (bad.length) problems.push(`these cited keys are not supported by found evidence: ${bad.join(", ")}`);
        if (!check.passed) problems.push(`these values do not appear anywhere in the record: ${check.unverified.join(", ")}`);
        if (problems.length) return { result: { accepted: false, problems }, summary: `Rejected: ${problems.join("; ")}.` };
        const items = this.assessment.items.filter((i) => cites.includes(i.key));
        const evidences = this.assessment.verdict === "concede" ? [] : buildEvidences(items.length ? items : this.assessment.items, this.tx);
        this.draft = { notes, evidences, gaps: gapsFor(this.assessment), factCheck: check };
        return { result: { accepted: true }, summary: `Draft accepted: ${notes.length} characters, ${evidences.length} evidence group(s), fact check passed.` };
      }
    }
    throw new Error(`Unknown tool ${name}`);
  }
}

function toolTitle(name: string, args: Record<string, unknown>) {
  const a = Object.values(args).filter((v) => typeof v === "string").map((v) => String(v).slice(0, 40));
  return `${name}(${a.join(", ")})`;
}

const TOOLS: ToolDef[] = [
  { type: "function", function: { name: "list_disputes", description: "List the merchant's open disputes with deadlines.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_dispute", description: "Get reason code, amount, stage, deadline and the buyer's claim for one dispute.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
  { type: "function", function: { name: "get_transaction", description: "Get the underlying order: items, amounts, dates, fulfilment and shipment, messages, refunds, policy, risk checks.", parameters: { type: "object", properties: { id: { type: "string", description: "Transaction ID from the dispute" } }, required: ["id"] } } },
  { type: "function", function: { name: "search_transactions", description: "Find this buyer's other transactions with the merchant.", parameters: { type: "object", properties: { buyer_email: { type: "string" } }, required: ["buyer_email"] } } },
  { type: "function", function: { name: "assess_evidence", description: "Compare the evidence this reason code needs against what the record contains. Returns each item as found, partial, missing or contradicts, plus a score and verdict (strong, weak, concede). Call after gathering the dispute, transaction and buyer history.", parameters: { type: "object", properties: { dispute_id: { type: "string" } }, required: ["dispute_id"] } } },
  {
    type: "function",
    function: {
      name: "draft_response",
      description: "Submit the seller response for the merchant to review. Rejected if it cites evidence that wasn't found or contains any amount, date or ID not in the record.",
      parameters: {
        type: "object",
        properties: {
          dispute_id: { type: "string" },
          notes: { type: "string", description: "The response to PayPal, plain English, under 1800 characters. For a concede verdict, a short note to the merchant explaining why to accept the claim." },
          cites: { type: "array", items: { type: "string" }, description: "Evidence keys (from assess_evidence) the notes rely on. Only keys with status found or partial." },
        },
        required: ["dispute_id", "notes", "cites"],
      },
    },
  },
];

function systemPrompt(d: { id: string }) {
  return `You are Rebuttal, an agent that prepares PayPal dispute responses for a small merchant. Work on dispute ${d.id}.

Process: get the dispute, get its transaction, search the buyer's history, call assess_evidence, then call draft_response. Before every tool call, write one short sentence saying why you are calling it and what you expect to learn.

Hard rules:
- Use only facts returned by tools. Never state, estimate or imply a fact that is not in a tool result. Copy amounts, dates and IDs exactly.
- If evidence is missing, the response must not suggest it exists. Do not mention missing evidence to PayPal at all.
- Cite only evidence keys whose status is found or partial.
- If assess_evidence returns verdict "concede", call draft_response with a short note addressed to the merchant recommending they accept the claim, citing the reason, and an empty cites array.
- Otherwise address the notes to PayPal's dispute team: restate the claim in one line, then answer it point by point with the evidence, then make one clear request. Factual and calm. No legal language, no threats, no claims about law.
- If draft_response rejects your draft, fix exactly the problems it lists and resubmit.`;
}

async function runModel(run: Run, id: string, model: { key: string; name: string }) {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt({ id }) },
    { role: "user", content: `New dispute ${id} needs a response. Prepare it.` },
  ];
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const reply = await chat(model.key, model.name, messages, TOOLS);
    messages.push({ role: "assistant", content: reply.content ?? null, tool_calls: reply.tool_calls });
    const thought = reply.content?.trim();
    if (!reply.tool_calls?.length) {
      if (thought) await run.step({ kind: "reasoning", title: "Reasoning", reasoning: thought });
      if (run.draft) return;
      messages.push({ role: "user", content: "You have not submitted a draft yet. Continue with the process and call draft_response." });
      continue;
    }
    for (const [n, call] of reply.tool_calls.entries()) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      const { result } = await run.tool(call.function.name, args, n === 0 ? thought : undefined);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 6000) });
    }
    if (run.draft) return;
  }
  throw new Error(`No accepted draft after ${MAX_TURNS} turns`);
}

async function runRules(run: Run, id: string) {
  await run.tool("get_dispute", { id }, "Start with the dispute itself: the reason code decides which evidence matters.");
  const d = run.dispute!;
  const pb = PLAYBOOK[d.reason];
  const reqs = requirementsFor(d, null);
  await run.step({ kind: "plan", title: `Plan for "${pb.label}"`, reasoning: `${pb.question} That needs: ${reqs.map((r) => r.label.toLowerCase()).join("; ")}.` });
  await run.tool("get_transaction", { id: d.transactionId }, "Pull the order behind the dispute to see what was sold, shipped and said.");
  await run.tool("search_transactions", { buyer_email: d.buyer.email }, "Check this buyer's history with the merchant for patterns or duplicate charges.");
  await run.tool("assess_evidence", { dispute_id: id }, "Compare what this reason code needs against what the record contains.");
  const a = run.assessment!;
  const draft = rulesDraft(d, run.tx, a);
  await run.tool("draft_response", { dispute_id: id, notes: draft.notes, cites: draft.evidences.flatMap((e) => e.cites) }, a.verdict === "concede" ? "The record doesn't support a response, so the draft is a recommendation to the merchant instead." : "Write the response from found evidence only, grouped into PayPal evidence types.");
  if (!run.draft) run.draft = draft;
}

export async function runAgent(src: DataSource, id: string, opts: RunOptions): Promise<CaseFile> {
  const run = new Run(src, id, opts);
  let engine: CaseFile["engine"] = opts.model ? { kind: "model", model: opts.model.name } : { kind: "rules" };
  if (opts.model) {
    try {
      await runModel(run, id, opts.model);
    } catch (e) {
      await run.step({ kind: "error", title: "Model run stopped", reasoning: `${(e as Error).message}. Finishing with the rules engine so the merchant still gets a grounded draft.` });
      engine = { kind: "rules" };
      run.draft = null;
    }
  }
  if (!run.draft) await runRules(run, id);
  if (!run.assessment || !run.draft || !run.dispute) throw new Error("Agent finished without a draft");

  await run.step({
    kind: "check",
    title: run.draft.factCheck.passed ? "Fact check passed" : "Fact check found unverified values",
    reasoning: run.draft.factCheck.passed
      ? "Every amount, date and identifier in the draft appears in the dispute or transaction record."
      : `Not found in the record: ${run.draft.factCheck.unverified.join(", ")}. Review these before approving.`,
  });
  const a = run.assessment;
  await run.step({ kind: "result", title: `Verdict: ${a.verdict} (${a.score}/100)`, reasoning: a.rationale });

  return {
    disputeId: id,
    status: "needs_review",
    engine,
    assessment: a,
    draft: run.draft,
    log: run.log,
    processedAt: new Date().toISOString(),
  };
}
