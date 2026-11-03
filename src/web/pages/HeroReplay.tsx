import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { useCountUp } from "../hooks";
import { IconBrain, IconShield, IconTool } from "../components/Icons";

// A scripted replay of one seeded case, played on a loop. The content mirrors
// what the agent produces for seeded dispute "item not received" cases.
const STEPS = [
  { tool: "get_dispute", out: "Item not received · USD 860.00 · buyer says “Order never showed up.”" },
  { plan: "Can we prove the order reached the buyer? Needs tracking, delivery scan, address match, signature." },
  { tool: "get_transaction", out: "Invoice KT-10420 · Dining centrepiece collection · Northline Express, delivered." },
  { tool: "search_transactions", out: "2 earlier undisputed orders from this buyer." },
  { tool: "assess_evidence", out: "4 of 5 evidence items found." },
  { tool: "draft_response", out: "Draft accepted · 2 evidence groups · fact check passed." },
];

const EVIDENCE = [
  { label: "Carrier tracking number", ok: true },
  { label: "Carrier shows delivered", ok: true },
  { label: "Delivered to the order address", ok: true },
  { label: "Signature on delivery", ok: true },
  { label: "Buyer messages on record", ok: false },
];

const DRAFT = [
  "Dispute PP-D-100081 — item not received, USD 860.00.",
  "• Northline Express tracking, shipped 2026-10-04.",
  "• Marked delivered on 2026-10-06 to the order address.",
  "• Signed for by “E. Yildiz”.",
];

const TICK = 900;
const TOTAL = STEPS.length + EVIDENCE.length + DRAFT.length + 6;

export function HeroReplay() {
  const { t, verdict } = useI18n();
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [tick, setTick] = useState(reduced ? TOTAL : 0);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setTick((n) => (n >= TOTAL + 4 ? 0 : n + 1)), TICK);
    return () => clearInterval(id);
  }, [reduced]);

  const shownSteps = Math.min(STEPS.length, tick);
  const evTick = tick - 4;
  const shownEv = Math.max(0, Math.min(EVIDENCE.length, evTick));
  const scored = evTick >= EVIDENCE.length;
  const draftTick = tick - (4 + EVIDENCE.length + 1);
  const shownDraft = Math.max(0, Math.min(DRAFT.length, draftTick));
  const checked = draftTick > DRAFT.length;
  const score = useCountUp(scored ? 89 : 0, 1100);
  const current = STEPS[Math.min(shownSteps, STEPS.length - 1)];
  const running = tick < TOTAL;

  return (
    <div className="replay card" aria-label={t("live.title")} dir="ltr">
      <div className="replay-head">
        <div>
          <span className="replay-label">{running && <span className="live-dot" />}{t("live.title")}</span>
          <strong className="mono">PP-D-100081</strong>
          <span className="replay-meta">USD 860.00 · 19 h</span>
        </div>
        <span className={`pill ${scored ? "pill-strong" : "pill-info pill-processing"} replay-pill`}>
          <span className="dot" />
          {scored ? verdict("strong") : t("status.processing")}
        </span>
      </div>
      <div className="progress">
        <span style={{ transform: `scaleX(${Math.min(1, tick / TOTAL)})` }} />
      </div>
      <p className="replay-now mono">{running ? (current.tool ? `${current.tool}…` : "planning…") : t("live.done")}</p>

      <div className="replay-grid">
        <ol className="replay-steps">
          {STEPS.slice(0, shownSteps).map((s, i) => (
            <li key={i} className="replay-step">
              <span className={`replay-ico${s.tool ? " tool" : ""}`}>{s.tool ? <IconTool /> : <IconBrain />}</span>
              <div>
                <span className={s.tool ? "mono replay-tool" : "replay-plan"}>{s.tool ?? "plan"}</span>
                <p>{s.out ?? s.plan}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="replay-side">
          <div className="replay-score">
            <svg viewBox="0 0 64 64" className="ring ring-strong" aria-hidden="true">
              <circle cx="32" cy="32" r="26" className="ring-track" />
              <circle cx="32" cy="32" r="26" className="ring-fill" strokeDasharray={163.4} strokeDashoffset={163.4 * (1 - score / 100)} />
              <text x="32" y="37" textAnchor="middle" className="ring-text">{Math.round(score)}</text>
            </svg>
            <ul className="replay-ev">
              {EVIDENCE.map((e, i) => (
                <li key={e.label} className={i < shownEv ? (e.ok ? "on" : "miss") : ""}>
                  <span aria-hidden="true">{i < shownEv ? (e.ok ? "✓" : "–") : ""}</span>
                  {e.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="replay-draft">
            {DRAFT.slice(0, shownDraft).map((l) => (
              <p key={l} className="mono">{l}</p>
            ))}
            {shownDraft > 0 && shownDraft < DRAFT.length && <span className="caret" />}
            {checked && (
              <p className="replay-check">
                <IconShield /> {t("detail.factOk")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
