import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CustomCellRendererProps } from "ag-grid-react";
import { PLAYBOOK } from "../../shared/playbook";
import { ACCEPT_NOTE, evidenceInput } from "../../shared/paypal-payload";
import { offerNote, suggestOffer } from "../../shared/settle";
import type { AgentStep, CaseDetail as Detail, DraftEvidence, EvidenceItem, QueueRow, Verdict } from "../../shared/types";
import { api } from "../api";
import { useI18n, type Key } from "../i18n";
import { useCountUp } from "../hooks";
import { useToast } from "../components/Toasts";
import { IconAlert, IconSpark, IconBrain, IconCheck, IconFlag, IconRefresh, IconShield, IconTool, IconUndo, IconX } from "../components/Icons";
import { VERDICT_CLASS } from "./cells";
import { useConsole } from "./context";

type Tab = "evidence" | "draft" | "payload" | "log" | "record";
const TABS: { id: Tab; key: Key }[] = [
  { id: "evidence", key: "detail.tabEvidence" },
  { id: "draft", key: "detail.tabDraft" },
  { id: "payload", key: "detail.tabPayload" },
  { id: "log", key: "detail.tabLog" },
  { id: "record", key: "detail.tabRecord" },
];

// Measured heights survive the row being scrolled out and back in.
const HEIGHTS = new Map<string, number>();
export const detailHeight = (id: string) => HEIGHTS.get(id) ?? 560;

/** Full-width grid row holding a dispute's case file; it sizes itself to its content. */
export function DetailFullRow(p: CustomCellRendererProps<QueueRow & { detailOf?: string }>) {
  const ref = useRef<HTMLDivElement>(null);
  const id = p.data?.detailOf;
  useEffect(() => {
    const el = ref.current;
    if (!el || !id) return;
    const ro = new ResizeObserver(() => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (!h || HEIGHTS.get(id) === h) return;
      HEIGHTS.set(id, h);
      if (!p.api.isDestroyed()) {
        p.node.setRowHeight(h);
        p.api.onRowHeightChanged();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, p.api, p.node]);
  if (!p.data || !id) return null;
  return (
    <div ref={ref} className="detail-full">
      <CaseDetailRow data={{ ...p.data, id }} />
    </div>
  );
}

export function CaseDetailRow(p: { data?: QueueRow }) {
  const row = p.data!;
  const { mode } = useConsole();
  const { t } = useI18n();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    api.detail(mode, row.id).then((d) => live && setDetail(d), (e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [mode, row.id, row.status, row.score, nonce]);

  if (error)
    return (
      <div className="detail">
        <div className="error-card" role="alert">
          <IconAlert />
          <div>
            <strong>{t("error.title")}</strong>
            <p>{error}</p>
            <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setNonce((n) => n + 1)}>
              {t("error.retry")}
            </button>
          </div>
        </div>
      </div>
    );
  if (!detail) return <DetailSkeleton />;
  return <DetailBody detail={detail} row={row} />;
}

function DetailSkeleton() {
  const { t } = useI18n();
  return (
    <div className="detail" aria-busy="true" aria-label={t("detail.loading")}>
      <div className="detail-head">
        <div style={{ display: "grid", gap: 10, flex: 1 }}>
          <span className="skel" style={{ height: 12, width: 120 }} />
          <span className="skel" style={{ height: 20, width: "80%" }} />
          <span className="skel" style={{ height: 20, width: "55%" }} />
        </div>
        <span className="skel" style={{ height: 96, width: 260, borderRadius: 14 }} />
      </div>
      <div style={{ display: "grid", gap: 10, marginTop: 22 }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="skel" style={{ height: 54, borderRadius: 12 }} />
        ))}
      </div>
      <p className="muted" style={{ marginTop: 14, fontSize: 14 }}>
        {t("detail.loading")}
      </p>
    </div>
  );
}

function ScoreRing({ score, verdict }: { score: number; verdict: "strong" | "weak" | "concede" }) {
  const v = useCountUp(score, 800);
  const c = 2 * Math.PI * 26;
  return (
    <svg viewBox="0 0 64 64" className={`ring ring-${verdict}`} aria-hidden="true">
      <circle cx="32" cy="32" r="26" className="ring-track" />
      <circle cx="32" cy="32" r="26" className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
      <text x="32" y="37" textAnchor="middle" className="ring-text">
        {Math.round(v)}
      </text>
    </svg>
  );
}

function DetailBody({ detail, row }: { detail: Detail; row: QueueRow }) {
  const { t, verdict, date, money } = useI18n();
  const { mode, onCaseChanged, rerun } = useConsole();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("evidence");
  const c = detail.caseFile;
  const d = detail.dispute;
  const pb = PLAYBOOK[d.reason];
  const tabsRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ x: 0, w: 0 });

  useEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`);
    if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
  }, [tab, t]);

  const [notes, setNotes] = useState(c?.editedNotes ?? c?.draft.notes ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setNotes(c?.editedNotes ?? c?.draft.notes ?? ""), [c?.editedNotes, c?.draft.notes]);

  if (!c) return <DetailSkeleton />;
  const a = c.assessment;
  const decided = c.status !== "needs_review" && c.status !== "processing";
  const dirty = notes !== (c.editedNotes ?? c.draft.notes);

  const act = async (kind: "approve" | "concede" | "reopen" | "save" | "revert" | "settle", amount?: number) => {
    setBusy(kind);
    try {
      let next;
      if (kind === "save") next = await api.saveDraft(mode, d.id, notes);
      else if (kind === "revert") next = await api.saveDraft(mode, d.id, c.draft.notes);
      else {
        if (dirty) await api.saveDraft(mode, d.id, notes);
        next = await api.decide(mode, d.id, kind, amount);
      }
      onCaseChanged(d.id, next);
      toast(kind === "settle" ? t("toast.settled") : kind === "approve" ? t("toast.approved") : kind === "concede" ? t("toast.conceded") : kind === "reopen" ? t("toast.reopened") : t("detail.saved"));
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="detail">
      <div className="detail-head">
        <div className="detail-claim">
          <span className="eyebrow">{t("detail.claim")}</span>
          <blockquote dir="auto">“{d.buyerClaim}”</blockquote>
          <span className="eyebrow" style={{ marginTop: 14 }}>{t("detail.question")}</span>
          <p className="detail-question" dir="auto">{pb.question}</p>
        </div>
        <div className={`verdict-card verdict-${a.verdict}`}>
          <ScoreRing score={a.score} verdict={a.verdict} />
          <div>
            <span className="eyebrow">{t("detail.recommend")}</span>
            <span className={`pill ${VERDICT_CLASS[a.verdict]}`}>
              <span className="dot" />
              {verdict(a.verdict)}
            </span>
            <p className="verdict-why" dir="auto">{a.rationale}</p>
          </div>
        </div>
      </div>

      <div className="tabs" role="tablist" ref={tabsRef}>
        <span className="tabs-thumb" style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }} aria-hidden="true" />
        {TABS.map((x) => (
          <button key={x.id} role="tab" data-tab={x.id} aria-selected={tab === x.id} onClick={() => setTab(x.id)}>
            {t(x.key)}
            {x.id === "evidence" && <span className="tab-count mono">{row.found}/{row.needed}</span>}
            {x.id === "log" && <span className="tab-count mono">{c.log.length}</span>}
          </button>
        ))}
      </div>

      <div className="tab-panel" key={tab} role="tabpanel">
        {tab === "evidence" && <EvidenceList items={a.items} />}
        {tab === "draft" && (
          <div className="draft">
            {a.verdict === "concede" && <div className="note note-concede"><IconFlag />{t("detail.concedeNote")}</div>}
            <p className="muted small">{t("detail.draftNote")} {t("detail.englishNote")}</p>
            <label className="sr-only" htmlFor={`notes-${d.id}`}>{t("detail.tabDraft")}</label>
            <textarea dir="auto" id={`notes-${d.id}`} className="editor" value={notes} maxLength={2000} disabled={c.status === "filed"} onChange={(e) => setNotes(e.target.value)} />
            <div className="draft-meta">
              <span className={`mono small ${notes.length > 1800 ? "warn" : "muted"}`}>{t("detail.chars", { n: notes.length })}</span>
              <span className="spacer" />
              {dirty && (
                <button className="btn btn-sm" onClick={() => act("save")} disabled={!!busy}>
                  {t("detail.save")}
                </button>
              )}
              {c.editedNotes && !dirty && (
                <button className="btn btn-sm btn-ghost" onClick={() => act("revert")} disabled={!!busy}>
                  <IconUndo />
                  {t("detail.revert")}
                </button>
              )}
            </div>
            <div className={`note ${c.draft.factCheck.passed ? "note-ok" : "note-warn"}`}>
              {c.draft.factCheck.passed ? <IconShield /> : <IconAlert />}
              {c.draft.factCheck.passed ? t("detail.factOk") : t("detail.factFail", { v: c.draft.factCheck.unverified.join(", ") })}
            </div>
            {c.draft.evidences.length > 0 && (
              <div className="sub">
                <h4>{t("detail.evidenceTypes")}</h4>
                <ul className="ev-types">
                  {c.draft.evidences.map((e) => (
                    <li key={e.evidence_type}>
                      <span className="mono">{e.evidence_type}</span>
                      {e.evidence_info?.tracking_info?.map((ti) => (
                        <span key={ti.tracking_number} className="muted small">
                          {ti.carrier_name_other} · <span className="mono">{ti.tracking_number}</span>
                        </span>
                      ))}
                      {e.evidence_info?.refund_ids?.map((r) => (
                        <span key={r} className="muted small mono">{r}</span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {c.draft.gaps.length > 0 && (
              <div className="sub">
                <h4>{t("detail.gaps")}</h4>
                <ul className="gaps" dir="auto">
                  {c.draft.gaps.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {tab === "payload" && <PayloadView id={d.id} verdict={a.verdict} evidences={c.draft.evidences} notes={notes} offer={suggestOffer(d.amount.value, a.score, a.verdict)?.value} currency={d.amount.currency} />}
        {tab === "log" && <AgentLog steps={c.log} />}
        {tab === "record" && <RecordView detail={detail} />}
      </div>

      {!decided && <SettlePanel amount={d.amount.value} currency={d.amount.currency} score={a.score} verdict={a.verdict} busy={!!busy} onSend={(v) => act("settle", v)} />}
      {c.offer && (
        <div className="note note-ok settle-sent">
          <IconCheck />
          {t("settle.sent", { v: money(c.offer.amount, c.offer.currency) })}
        </div>
      )}

      <div className="detail-actions">
        <button className="btn btn-sm btn-ai" onClick={() => dispatchEvent(new CustomEvent("rb:assistant", { detail: t("detail.askPrompt", { id: d.id }) }))}>
          <IconSpark />
          {t("detail.ask")}
        </button>
        <span className="muted small">
          {t("detail.engine")}: <strong>{c.engine.kind === "model" ? c.engine.model : t("ws.engineRules")}</strong>
          {c.decidedAt && <> · {t("detail.decided", { when: date(c.decidedAt) })}</>}
          {c.filing && <> · {c.filing.message}</>}
        </span>
        <span className="spacer" />
        {decided ? (
          c.status !== "filed" && (
            <button className="btn" onClick={() => act("reopen")} disabled={!!busy}>
              <IconUndo />
              {t("detail.reopen")}
            </button>
          )
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => rerun(d.id)} disabled={!!busy}>
              <IconRefresh />
              {t("detail.rerun")}
            </button>
            <button className="btn btn-danger" onClick={() => act("concede")} disabled={!!busy}>
              <IconX />
              {t("detail.concede")}
            </button>
            {a.verdict !== "concede" && (
              <button className="btn btn-primary" onClick={() => act("approve")} disabled={!!busy || !notes.trim()}>
                <IconCheck />
                {mode === "sandbox" ? t("detail.approveSandbox") : t("detail.approve")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const STATUS_ICON: Record<EvidenceItem["status"], string> = { found: "✓", partial: "◐", missing: "–", contradicts: "!", not_needed: "·" };

function EvidenceList({ items }: { items: EvidenceItem[] }) {
  const { t } = useI18n();
  return (
    <ul className="evidence">
      {items.map((i, n) => (
        <li key={i.key} className={`ev ev-${i.status} rise`} style={{ ["--i" as string]: n }}>
          <span className="ev-mark" aria-hidden="true">{STATUS_ICON[i.status]}</span>
          <div className="ev-body" dir="auto">
            <div className="ev-top">
              <strong>{i.label}</strong>
              {i.critical && <span className="tag-critical">key</span>}
              <span className={`ev-status ev-status-${i.status}`}>{t(`detail.${i.status}` as Key)}</span>
            </div>
            <p>{i.detail}</p>
            <p className="ev-why">
              <span>{t("detail.why")}:</span> {i.why}
              {i.source && <code className="ev-source">{i.source}</code>}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function stepIcon(s: AgentStep) {
  if (s.kind === "tool") return <IconTool />;
  if (s.kind === "check") return <IconShield />;
  if (s.kind === "result") return <IconFlag />;
  if (s.kind === "error") return <IconAlert />;
  return <IconBrain />;
}

export function AgentLog({ steps, live = false }: { steps: AgentStep[]; live?: boolean }) {
  return (
    <ol className={`log${live ? " log-live" : ""}`}>
      {steps.map((s, n) => (
        <li key={s.i} className={`log-step log-${s.kind} rise`} style={{ ["--i" as string]: live ? 0 : n }}>
          <span className="log-icon">{stepIcon(s)}</span>
          <details open={live || s.kind !== "tool"} dir="auto">
            <summary>
              <span className={s.tool ? "mono log-title" : "log-title"}>{s.title}</span>
              {s.ms != null && <span className="log-ms mono">{s.ms} ms</span>}
            </summary>
            {s.reasoning && <p className="log-why">{s.reasoning}</p>}
            {s.output && <p className="log-out">→ {s.output}</p>}
            {s.args && Object.keys(s.args).length > 0 && <pre className="log-args">{JSON.stringify(s.args, null, 2).slice(0, 1200)}</pre>}
          </details>
        </li>
      ))}
    </ol>
  );
}

function RecordView({ detail }: { detail: Detail }) {
  const { t, money, date } = useI18n();
  const tx = detail.transaction;
  if (!tx) return <p className="muted">The underlying transaction could not be found in the record.</p>;
  return (
    <div className="record" dir="auto">
      <section>
        <h4>{t("detail.items")} · <span className="mono">{tx.invoiceId}</span></h4>
        <table className="rtable">
          <tbody>
            {tx.items.map((i) => (
              <tr key={i.sku + i.name}>
                <td>{i.quantity}×</td>
                <td>{i.name}</td>
                <td className="mono tnum end">{money(i.unitPrice * i.quantity, tx.amount.currency)}</td>
              </tr>
            ))}
            <tr className="total">
              <td />
              <td>{date(tx.date)}</td>
              <td className="mono tnum end">{money(tx.amount.value, tx.amount.currency)}</td>
            </tr>
          </tbody>
        </table>
      </section>
      {tx.shipment && (
        <section>
          <h4>{t("detail.shipment")}</h4>
          <dl className="kv">
            <dt>Carrier</dt><dd>{tx.shipment.carrier}</dd>
            <dt>Status</dt><dd>{tx.shipment.status.replace(/_/g, " ")}</dd>
            {tx.shipment.trackingNumber && <><dt>Tracking</dt><dd className="mono">{tx.shipment.trackingNumber}</dd></>}
            {tx.shipment.deliveredAt && <><dt>Delivered</dt><dd>{date(tx.shipment.deliveredAt)}</dd></>}
            {tx.shipment.deliveredTo && <><dt>To</dt><dd>{tx.shipment.deliveredTo}</dd></>}
          </dl>
        </section>
      )}
      <section>
        <h4>{t("detail.messages")}</h4>
        {tx.messages.length ? (
          <ul className="msgs">
            {tx.messages.map((m) => (
              <li key={m.at + m.text} className={`msg msg-${m.from}`}>
                <span className="muted small">{m.from} · {date(m.at)}</span>
                <p>{m.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">{t("detail.noMessages")}</p>
        )}
      </section>
      <section>
        <h4>{t("detail.history")}</h4>
        {detail.history.length ? (
          <ul className="hist">
            {detail.history.map((h) => (
              <li key={h.id}>
                <span className="mono">{h.invoiceId}</span>
                <span className="muted">{date(h.date)}</span>
                <span>{h.items.map((i) => i.name).join(", ")}</span>
                <span className="mono tnum end">{money(h.amount.value, h.amount.currency)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">{t("detail.noHistory")}</p>
        )}
      </section>
      <section>
        <h4>{t("detail.policy")}</h4>
        <p className="small">{tx.policy.text || "—"}</p>
      </section>
    </div>
  );
}

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;

function JsonCode({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(JSON_TOKEN)) {
    out.push(text.slice(last, m.index));
    const cls = m[1] ? (m[2] ? "j-key" : "j-str") : m[3] ? "j-lit" : "j-num";
    out.push(<span key={m.index} className={cls}>{m[1] ?? m[0]}</span>);
    if (m[2]) out.push(m[2]);
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return <code>{out}</code>;
}

function Request({ method, path, contentType, part, body }: { method: string; path: string; contentType: string; part?: string; body: unknown }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(body, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <figure className="req">
      <figcaption className="req-head">
        <span className="req-method mono">{method}</span>
        <span className="req-path mono">{path}</span>
        <span className="spacer" />
        <button className={`btn btn-sm btn-ghost${copied ? " copied" : ""}`} onClick={copy}>
          {copied ? <IconCheck /> : null}
          {copied ? t("detail.copied") : t("detail.copy")}
        </button>
      </figcaption>
      <div className="req-meta mono">
        <span>Host: api-m.sandbox.paypal.com</span>
        <span>Content-Type: {contentType}</span>
        {part && <span>Part: {part}</span>}
      </div>
      <pre className="req-body" dir="ltr">
        <JsonCode value={body} />
      </pre>
    </figure>
  );
}

function PayloadView({ id, verdict, evidences, notes, offer, currency }: { id: string; verdict: Verdict; evidences: DraftEvidence[]; notes: string; offer?: number; currency: string }) {
  const { t } = useI18n();
  const base = `/v1/customer/disputes/${id}`;
  return (
    <div className="payload">
      <p className="muted small">{t("detail.payloadNote")}</p>
      {verdict !== "concede" && evidences.length > 0 && (
        <Request method="POST" path={`${base}/provide-evidence`} contentType="multipart/form-data" part='name="input"; application/json' body={evidenceInput(evidences, notes)} />
      )}
      {verdict !== "concede" && <p className="muted small">{t("detail.payloadConcede")}</p>}
      <Request method="POST" path={`${base}/accept-claim`} contentType="application/json" body={{ note: ACCEPT_NOTE }} />
      {offer != null && (
        <>
          <p className="muted small">{t("detail.payloadSettle")}</p>
          <Request method="POST" path={`${base}/make-offer`} contentType="application/json" body={{ note: offerNote(offer.toFixed(2), currency), offer_amount: { currency_code: currency, value: offer.toFixed(2) }, offer_type: "REFUND" }} />
        </>
      )}
    </div>
  );
}

/** The third path between fighting and conceding: a partial refund sized by the evidence score. */
function SettlePanel({ amount, currency, score, verdict, busy, onSend }: { amount: number; currency: string; score: number; verdict: Verdict; busy: boolean; onSend: (v: number) => void }) {
  const { t, money } = useI18n();
  const { mode } = useConsole();
  const s = suggestOffer(amount, score, verdict);
  const [value, setValue] = useState(s ? s.value.toFixed(2) : "");
  if (!s) return null;
  const v = parseFloat(value);
  const valid = v > 0 && v < amount;
  return (
    <section className="settle" aria-label={t("settle.title")}>
      <div className="settle-copy">
        <span className="eyebrow">{t("settle.title")}</span>
        <p>{t("settle.body", { p: Math.round(score), loss: money(amount * (1 - score / 100), currency) })}</p>
      </div>
      <div className="settle-form">
        <label className="settle-field">
          <span className="small muted">{t("settle.amount")}</span>
          <span className="settle-input">
            <span className="mono">{currency}</span>
            <input type="number" inputMode="decimal" min={1} max={amount - 0.01} step={0.5} value={value} onChange={(e) => setValue(e.target.value)} />
          </span>
          <span className="small muted">{t("settle.of", { v: money(amount, currency) })}{valid && <> · {t("settle.saves", { v: money(amount - v, currency) })}</>}</span>
        </label>
        <div className="settle-meter" aria-hidden="true">
          <span style={{ transform: `scaleX(${valid ? v / amount : 0})` }} />
        </div>
        <button className="btn btn-settle" onClick={() => onSend(v)} disabled={busy || !valid}>
          {mode === "sandbox" ? t("settle.sendSandbox") : t("settle.send")}
        </button>
      </div>
    </section>
  );
}
