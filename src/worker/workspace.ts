import { DurableObject } from "cloudflare:workers";
import type { CaseDetail, CaseFile, Dispute, QueueRow, StreamEvent, Transaction, WorkspaceInfo } from "../shared/types";
import { ACCEPT_NOTE } from "../shared/paypal-payload";
import { offerNote } from "../shared/settle";
import { runAgent, type DataSource } from "./agent";
import type { ChatContext } from "./chat";
import { PayPalClient } from "./paypal";
import { freshDispute, MERCHANT, seedWorkspace } from "./seed";
import type { Env } from "./index";

const LIVE_RUNS_PER_DAY = 25;
const GLOBAL_MODEL_RUNS_PER_DAY = 600;
const CHATS_PER_DAY = 60;

interface Meta {
  createdAt: number;
  mode: "demo" | "sandbox";
  freshCount: number;
  runsDay: string;
  runs: number;
  syncedAt?: number;
  chatDay?: string;
  chats?: number;
}

export function toRow(d: Dispute, c: CaseFile | null | undefined): QueueRow {
  const counted = c?.assessment.items.filter((i) => i.status !== "not_needed") ?? [];
  return {
    id: d.id,
    origin: d.origin,
    reason: d.reason,
    stage: d.stage,
    amount: d.amount.value,
    currency: d.amount.currency,
    buyerName: d.buyer.name,
    buyerEmail: d.buyer.email,
    createdAt: d.createdAt,
    responseDueAt: d.responseDueAt,
    verdict: c?.assessment.verdict,
    score: c?.assessment.score,
    found: counted.filter((i) => i.status === "found").length,
    needed: counted.length,
    status: c?.status ?? "processing",
    engine: c?.engine.kind,
  };
}

export class Workspace extends DurableObject<Env> {
  private ready: Promise<Meta> | null = null;

  protected get isSandbox() {
    return false;
  }

  private paypal() {
    if (!this.env.PAYPAL_CLIENT_ID || !this.env.PAYPAL_CLIENT_SECRET) throw new Error("PayPal sandbox credentials are not configured on this deployment.");
    return new PayPalClient(this.env.PAYPAL_CLIENT_ID, this.env.PAYPAL_CLIENT_SECRET);
  }

  private source(): DataSource {
    const st = this.ctx.storage;
    if (this.isSandbox) {
      const pp = this.paypal();
      return {
        listDisputes: () => pp.listDisputes(),
        getDispute: async (id) => (await st.get<Dispute>(`d:${id}`)) ?? pp.getDispute(id),
        getTransaction: async (id, around) => {
          const tx = (await st.get<Transaction>(`t:${id}`)) ?? (await pp.getTransaction(id, around));
          if (tx) await st.put(`t:${id}`, tx);
          return tx;
        },
        searchTransactions: (email, around) => pp.searchByBuyer(email, around),
      };
    }
    return {
      listDisputes: async () => [...(await st.list<Dispute>({ prefix: "d:" })).values()],
      getDispute: async (id) => (await st.get<Dispute>(`d:${id}`)) ?? null,
      getTransaction: async (id) => (await st.get<Transaction>(`t:${id}`)) ?? null,
      searchTransactions: async (email) => [...(await st.list<Transaction>({ prefix: "t:" })).values()].filter((t) => t.buyer.email === email),
    };
  }

  private meta(): Promise<Meta> {
    this.ready ??= this.ctx.blockConcurrencyWhile(async () => {
      const existing = await this.ctx.storage.get<Meta>("meta");
      if (existing) return existing;
      const meta: Meta = { createdAt: Date.now(), mode: this.isSandbox ? "sandbox" : "demo", freshCount: 0, runsDay: "", runs: 0 };
      if (!this.isSandbox) await this.seed(meta.createdAt);
      await this.ctx.storage.put("meta", meta);
      return meta;
    });
    return this.ready;
  }

  private async seed(now: number) {
    const data = seedWorkspace(now);
    await this.putData(data.disputes, data.transactions);
    const src = this.source();
    for (const d of data.disputes) {
      const c = await runAgent(src, d.id, {});
      await this.ctx.storage.put(`c:${d.id}`, c);
    }
  }

  private async putData(disputes: Dispute[], txs: Transaction[]) {
    const entries: Record<string, unknown> = {};
    for (const d of disputes) entries[`d:${d.id}`] = d;
    for (const t of txs) entries[`t:${t.id}`] = t;
    const keys = Object.keys(entries);
    for (let i = 0; i < keys.length; i += 100) await this.ctx.storage.put(Object.fromEntries(keys.slice(i, i + 100).map((k) => [k, entries[k]])));
  }

  async info(): Promise<WorkspaceInfo> {
    const meta = await this.meta();
    const disputes = await this.ctx.storage.list<Dispute>({ prefix: "d:" });
    const cases = await this.ctx.storage.list<CaseFile>({ prefix: "c:" });
    const rows = [...disputes.values()].map((d) => toRow(d, cases.get(`c:${d.id}`)));
    rows.sort((a, b) => a.responseDueAt.localeCompare(b.responseDueAt));
    return {
      mode: meta.mode,
      merchant: this.isSandbox ? "PayPal sandbox merchant" : MERCHANT,
      model: this.model()?.name.split(",")[0].trim() ?? null,
      sandboxAvailable: Boolean(this.env.PAYPAL_CLIENT_ID && this.env.PAYPAL_CLIENT_SECRET),
      liveRunsLeft: Math.max(0, LIVE_RUNS_PER_DAY - (meta.runsDay === today() ? meta.runs : 0)),
      rows,
    };
  }

  async detail(id: string): Promise<CaseDetail | null> {
    await this.meta();
    const dispute = await this.ctx.storage.get<Dispute>(`d:${id}`);
    if (!dispute) return null;
    const transaction = (await this.ctx.storage.get<Transaction>(`t:${dispute.transactionId}`)) ?? null;
    const all = this.isSandbox ? [] : [...(await this.ctx.storage.list<Transaction>({ prefix: "t:" })).values()];
    const history = all.filter((t) => t.buyer.email === dispute.buyer.email && t.id !== dispute.transactionId);
    const caseFile = (await this.ctx.storage.get<CaseFile>(`c:${id}`)) ?? null;
    return { dispute, transaction, history, caseFile };
  }

  private model() {
    return this.env.OPENROUTER_API_KEY && this.env.OPENROUTER_MODEL ? { key: this.env.OPENROUTER_API_KEY, name: this.env.OPENROUTER_MODEL } : undefined;
  }

  private async takeRun(): Promise<boolean> {
    const meta = await this.meta();
    if (meta.runsDay !== today()) Object.assign(meta, { runsDay: today(), runs: 0 });
    if (meta.runs >= LIVE_RUNS_PER_DAY) return false;
    meta.runs++;
    await this.ctx.storage.put("meta", meta);
    return true;
  }

  /** Counts one assistant question against today's allowance and returns what the assistant may see. */
  async chatContext(ids: string[]): Promise<ChatContext | null> {
    const meta = await this.meta();
    if (meta.chatDay !== today()) Object.assign(meta, { chatDay: today(), chats: 0 });
    if ((meta.chats ?? 0) >= CHATS_PER_DAY) return null;
    meta.chats = (meta.chats ?? 0) + 1;
    await this.ctx.storage.put("meta", meta);
    const info = await this.info();
    const cases: ChatContext["cases"] = [];
    for (const id of ids.slice(0, 3)) {
      const dispute = await this.ctx.storage.get<Dispute>(`d:${id}`);
      if (dispute) cases.push({ dispute, caseFile: (await this.ctx.storage.get<CaseFile>(`c:${id}`)) ?? null });
    }
    return { merchant: info.merchant, mode: info.mode, rows: info.rows, cases };
  }

  async takeGlobal(): Promise<boolean> {
    const key = `g:${today()}`;
    const n = ((await this.ctx.storage.get<number>(key)) ?? 0) + 1;
    if (n > GLOBAL_MODEL_RUNS_PER_DAY) return false;
    await this.ctx.storage.put(key, n);
    return true;
  }

  private stream(work: (send: (e: StreamEvent) => Promise<void>) => Promise<void>): ReadableStream {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    const send = async (e: StreamEvent) => {
      await writer.write(enc.encode(`data: ${JSON.stringify(e)}\n\n`)).catch(() => {});
    };
    this.ctx.waitUntil(
      (async () => {
        try {
          await work(send);
        } catch (e) {
          await send({ type: "error", message: (e as Error).message });
        } finally {
          await writer.close().catch(() => {});
        }
      })()
    );
    return readable;
  }

  private async process(id: string, send: (e: StreamEvent) => Promise<void>) {
    if (!(await this.takeRun())) throw new Error(`This workspace has used today's ${LIVE_RUNS_PER_DAY} live agent runs. Seeded cases are still fully reviewable.`);
    let model = this.model();
    if (model) {
      const quota = this.env.WORKSPACE.get(this.env.WORKSPACE.idFromName("__quota__"));
      if (!(await quota.takeGlobal())) model = undefined;
    }
    const prev = await this.ctx.storage.get<CaseFile>(`c:${id}`);
    const caseFile = await runAgent(this.source(), id, { model, pace: model ? 0 : 450, emit: (step) => send({ type: "step", step }) });
    if (prev?.editedNotes) caseFile.editedNotes = undefined;
    await this.ctx.storage.put(`c:${id}`, caseFile);
    const d = (await this.ctx.storage.get<Dispute>(`d:${id}`))!;
    await send({ type: "done", row: toRow(d, caseFile), caseFile });
  }

  async run(id: string): Promise<ReadableStream> {
    await this.meta();
    return this.stream(async (send) => {
      const d = await this.ctx.storage.get<Dispute>(`d:${id}`);
      if (!d) throw new Error("That dispute isn't in this workspace.");
      await send({ type: "dispute", row: toRow(d, null) });
      await this.process(id, send);
    });
  }

  async fresh(): Promise<ReadableStream> {
    const meta = await this.meta();
    if (this.isSandbox) throw new Error("New disputes in the sandbox come from PayPal. Use Sync instead.");
    return this.stream(async (send) => {
      meta.freshCount++;
      await this.ctx.storage.put("meta", meta);
      const data = freshDispute(Date.now(), meta.freshCount);
      await this.putData(data.disputes, data.transactions);
      await send({ type: "dispute", row: toRow(data.disputes[0], null) });
      await this.process(data.disputes[0].id, send);
    });
  }

  async sync(): Promise<{ added: number; total: number }> {
    if (!this.isSandbox) throw new Error("Sync is only available for the PayPal sandbox workspace.");
    const meta = await this.meta();
    const disputes = await this.paypal().listDisputes();
    let added = 0;
    for (const d of disputes) {
      if (!(await this.ctx.storage.get(`d:${d.id}`))) added++;
      await this.ctx.storage.put(`d:${d.id}`, d);
      if (!(await this.ctx.storage.get(`c:${d.id}`))) {
        // Real sandbox disputes are worked by the model; seeded demo data uses the rules engine.
        let model = this.model();
        if (model && !(await this.env.WORKSPACE.get(this.env.WORKSPACE.idFromName("__quota__")).takeGlobal())) model = undefined;
        const c = await runAgent(this.source(), d.id, { model });
        await this.ctx.storage.put(`c:${d.id}`, c);
      }
    }
    meta.syncedAt = Date.now();
    await this.ctx.storage.put("meta", meta);
    return { added, total: disputes.length };
  }

  async saveDraft(id: string, notes: string): Promise<CaseFile> {
    const c = await this.ctx.storage.get<CaseFile>(`c:${id}`);
    if (!c) throw new Error("No case file for that dispute yet.");
    if (c.status === "filed") throw new Error("This response was already filed and can't be edited.");
    c.editedNotes = notes.slice(0, 2000);
    await this.ctx.storage.put(`c:${id}`, c);
    return c;
  }

  async decide(id: string, action: "approve" | "concede" | "reopen" | "settle", amount?: number): Promise<CaseFile> {
    const c = await this.ctx.storage.get<CaseFile>(`c:${id}`);
    if (!c) throw new Error("No case file for that dispute yet.");
    if (c.status === "filed") throw new Error("This response was already filed with PayPal.");
    c.decidedAt = new Date().toISOString();
    if (action === "settle") {
      const d = await this.ctx.storage.get<Dispute>(`d:${id}`);
      if (!d) throw new Error("That dispute isn't in this workspace.");
      const value = Math.round((amount ?? 0) * 100) / 100;
      if (!(value > 0) || value >= d.amount.value) throw new Error(`The offer must be more than 0 and less than ${d.amount.currency} ${d.amount.value.toFixed(2)}.`);
      const note = offerNote(value.toFixed(2), d.amount.currency);
      if (this.isSandbox) {
        try {
          await this.paypal().makeOffer(id, value, d.amount.currency, note);
        } catch (e) {
          c.filing = { ok: false, message: (e as Error).message };
          await this.ctx.storage.put(`c:${id}`, c);
          throw e;
        }
      }
      c.status = this.isSandbox ? "filed" : "settled";
      c.offer = { amount: value, currency: d.amount.currency, note };
      c.filing = { ok: true, message: this.isSandbox ? `Partial refund offer of ${d.amount.currency} ${value.toFixed(2)} sent to the buyer through PayPal.` : "Seeded dispute: offer recorded in this workspace only. Nothing was sent to PayPal." };
      await this.ctx.storage.put(`c:${id}`, c);
      return c;
    }
    if (action === "reopen") {
      c.status = "needs_review";
      c.filing = undefined;
      c.offer = undefined;
    } else if (this.isSandbox) {
      const pp = this.paypal();
      const notes = c.editedNotes ?? c.draft.notes;
      try {
        if (action === "approve") await pp.provideEvidence(id, c.draft.evidences, notes);
        else await pp.acceptClaim(id, ACCEPT_NOTE);
        c.status = "filed";
        c.filing = { ok: true, message: action === "approve" ? "Evidence sent to the PayPal sandbox." : "Claim accepted in the PayPal sandbox." };
      } catch (e) {
        c.filing = { ok: false, message: (e as Error).message };
        await this.ctx.storage.put(`c:${id}`, c);
        throw e;
      }
    } else {
      c.status = action === "approve" ? "approved" : "conceded";
      c.filing = { ok: true, message: "Seeded dispute: recorded in this workspace only. Nothing was sent to PayPal." };
    }
    await this.ctx.storage.put(`c:${id}`, c);
    return c;
  }

  async bulk(ids: string[], action: "approve" | "concede"): Promise<{ done: string[]; failed: { id: string; message: string }[] }> {
    const done: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of ids.slice(0, 100)) {
      try {
        await this.decide(id, action);
        done.push(id);
      } catch (e) {
        failed.push({ id, message: (e as Error).message });
      }
    }
    return { done, failed };
  }

  async reset(): Promise<void> {
    await this.ctx.storage.deleteAll();
    this.ready = null;
    await this.meta();
  }
}

export class SandboxWorkspace extends Workspace {
  protected override get isSandbox() {
    return true;
  }
}

const today = () => new Date().toISOString().slice(0, 10);
