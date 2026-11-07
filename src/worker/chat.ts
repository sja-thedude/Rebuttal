import type { CaseFile, Dispute, QueueRow } from "../shared/types";
import { PLAYBOOK } from "../shared/playbook";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatContext {
  merchant: string;
  mode: "demo" | "sandbox";
  rows: QueueRow[];
  cases: { dispute: Dispute; caseFile: CaseFile | null }[];
}

const LANG_NAME: Record<string, string> = { en: "English", ar: "Arabic", fr: "French", es: "Spanish" };

const PRODUCT = `Rebuttal is an AI agent that defends merchants against PayPal payment disputes.
- It reads each open dispute from the PayPal Disputes API, works out which evidence its reason code needs (each of 8 PayPal reason codes has its own evidence playbook), pulls that evidence from the merchant's transaction records (PayPal Transaction Search, Orders, Payments and Tracking APIs), and drafts the seller response in the structure PayPal's provide-evidence endpoint accepts.
- It scores every case strong, weak or concede, and when the merchant's own records work against them it recommends accepting the claim instead of fighting.
- It never invents evidence: every amount, date and ID in a draft is fact-checked against the record, and drafts may only cite evidence marked found.
- Besides fighting or conceding there is a third path, settling: for weak and concede cases Rebuttal suggests a partial refund sized by the evidence score (about the expected loss if the merchant fights), which the merchant can adjust and send through PayPal's make-offer endpoint.
- It never files anything on its own. The merchant reviews, edits and approves every response. Approving in the PayPal sandbox workspace calls provide-evidence (or accept-claim for a concession).
- The agent is a tool-calling loop over list_disputes, get_dispute, get_transaction, search_transactions, assess_evidence and draft_response, run by an AI model through OpenRouter, with a deterministic rules engine as a labelled fallback. Every step is logged in the case file's Agent log tab.
- The console: an AG Grid queue sorted by deadline with filters, quick search, grouping by reason or verdict, bulk approve or concede, CSV export, and an expandable case file under each dispute (Evidence, Response, PayPal request preview, Agent log, Order record). Cross-filter charts above the queue show the money at stake by reason and by verdict, plus a score-weighted expected-recovery forecast. Press Cmd/Ctrl+K for the command palette. "Process a new dispute live" streams the agent working a fresh case.
- Two workspaces: a demo workspace of 40 seeded disputes for a fictional shop (clearly labelled seeded, nothing is sent anywhere) and a PayPal sandbox workspace with real sandbox disputes. Sandbox only: no live PayPal credentials.
- Who it is for: small and mid-sized online merchants who lose winnable disputes because they cannot gather proof and write a response before the deadline.
- It is not legal advice and never presents itself as such.
- Built with React, Cloudflare Workers and Durable Objects, AG Grid Community, AG Charts Community, PayPal sandbox APIs and OpenRouter. Available in English, Arabic, French and Spanish, light and dark.`;

function money(n: number, c = "USD") {
  return `${c} ${n.toFixed(2)}`;
}

function rowLine(r: QueueRow, now: number) {
  const h = Math.round((Date.parse(r.responseDueAt) - now) / 36e5);
  const due = h < 0 ? "overdue" : h < 48 ? `${h} h left` : `${Math.round(h / 24)} d left`;
  return `${r.id} | ${PLAYBOOK[r.reason]?.short ?? r.reason} | ${money(r.amount, r.currency)} | ${due} | ${r.verdict ?? "-"} ${r.score ?? ""} | evidence ${r.found}/${r.needed} | ${r.status} | ${r.buyerName}`;
}

function caseBlock({ dispute: d, caseFile: c }: ChatContext["cases"][number]) {
  const lines = [`Case ${d.id}: ${PLAYBOOK[d.reason]?.label ?? d.reason}, ${money(d.amount.value, d.amount.currency)}, buyer ${d.buyer.name}. Buyer's claim: "${d.buyerClaim}"`];
  if (c) {
    const a = c.assessment;
    lines.push(`Verdict ${a.verdict} (${a.score}/100). Rationale: ${a.rationale}`);
    lines.push("Evidence: " + a.items.map((i) => `${i.label}: ${i.status}${i.detail ? ` (${i.detail})` : ""}`).join("; "));
    if (c.draft.gaps.length) lines.push("Gaps: " + c.draft.gaps.join("; "));
    lines.push(`Draft response: ${(c.editedNotes ?? c.draft.notes).slice(0, 900)}`);
    lines.push(`Status: ${c.status}. Engine: ${c.engine.kind === "model" ? c.engine.model : "rules"}.`);
  }
  return lines.join("\n");
}

export function systemPrompt(lang: string, page: string, ctx: ChatContext | null) {
  const now = Date.now();
  const parts = [
    `You are the assistant inside Rebuttal. Answer questions about what Rebuttal does and how to use it${ctx ? ", and about the merchant's dispute queue shown below" : ""}.`,
    `Reply in ${LANG_NAME[lang] ?? "English"}. Be concise: usually 2 to 5 short sentences or a few bullets, under 140 words. Plain markdown only (bold, bullets, inline code). Mention dispute IDs exactly as written, e.g. PP-D-100081, so the interface can link them.`,
    "Only state facts found below. If something isn't covered, say you don't know. Never give legal advice; you may explain what evidence PayPal generally expects. Never claim a response was filed unless its status says filed.",
    `The visitor is on the ${page === "console" ? "console" : "landing page"}.`,
    "PRODUCT FACTS:\n" + PRODUCT,
  ];
  if (ctx) {
    parts.push(
      "ACTIONS: You can propose a queue action, which the merchant must confirm before anything happens. Only when the merchant asks you to act (approve, file, concede, accept, clear), end your reply with one action line. For a group, describe it with filters and let the interface find the matching disputes: [[approve where verdict=strong; due_h<=48]] or [[concede where verdict=concede; amount<=50]]. Filters: verdict=strong|weak|concede, due_h<=N (hours until the response deadline), amount<=N or amount>=N (in the dispute currency), reason=<words from the reason label, e.g. not received>. For specific disputes name them: [[approve: PP-D-100081, PP-D-100064]]. Approve suits strong cases; concede suits concede verdicts. Do not list the matching disputes yourself and do not claim facts about them; just say in one sentence what the action will do and that it waits for their confirmation. Never propose actions unless asked."
    );
    const open = ctx.rows.filter((r) => r.status === "needs_review" || r.status === "processing");
    parts.push(
      `WORKSPACE: ${ctx.mode === "sandbox" ? "PayPal sandbox workspace (real sandbox disputes)" : `demo workspace for "${ctx.merchant}" (seeded, fictional data)`}. ${ctx.rows.length} disputes, ${open.length} open, ${money(open.reduce((a, r) => a + r.amount, 0))} at stake. Current time ${new Date(now).toISOString()}.\nQUEUE (id | reason | amount | deadline | verdict score | evidence | status | buyer):\n` +
        ctx.rows.map((r) => rowLine(r, now)).join("\n")
    );
    if (ctx.cases.length) parts.push("CASE DETAILS:\n" + ctx.cases.map(caseBlock).join("\n\n"));
  }
  return parts.join("\n\n");
}

/** Streams the model's answer to the browser as SSE: {t} chunks, then {done} or {error}. */
export function chatStream(key: string, model: string, system: string, turns: ChatTurn[]): ReadableStream {
  const models = model.split(",").map((m) => m.trim()).filter(Boolean);
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const w = writable.getWriter();
  const send = (o: unknown) => w.write(enc.encode(`data: ${JSON.stringify(o)}\n\n`)).catch(() => {});

  (async () => {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://rebuttal.sjapathway.workers.dev", "X-Title": "Rebuttal" },
        body: JSON.stringify({
          ...(models.length > 1 ? { models } : { model: models[0] }),
          stream: true,
          temperature: 0.3,
          max_tokens: 700,
          // Chat answers come from the facts in the prompt; skipping hidden reasoning keeps replies fast.
          reasoning: { enabled: false },
          messages: [{ role: "system", content: system }, ...turns],
        }),
      });
      if (!res.ok || !res.body) throw new Error(`The assistant is busy right now (${res.status}). Try again in a moment.`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let used = models[0];
      let any = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const j = JSON.parse(data) as { model?: string; choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
            if (j.error) throw new Error(j.error.message ?? "Model error");
            if (j.model) used = j.model;
            const t = j.choices?.[0]?.delta?.content;
            if (t) {
              any = true;
              await send({ t });
            }
          } catch (e) {
            if ((e as Error).message && !(e instanceof SyntaxError)) throw e;
          }
        }
      }
      if (!any) throw new Error("The assistant didn't answer. Try asking again.");
      await send({ done: true, model: used });
    } catch (e) {
      await send({ error: (e as Error).message });
    } finally {
      await w.close().catch(() => {});
    }
  })();
  return readable;
}
