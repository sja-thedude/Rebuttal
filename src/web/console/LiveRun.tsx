import { useEffect, useRef, useState } from "react";
import type { AgentStep, CaseFile, QueueRow, StreamEvent } from "../../shared/types";
import { stream, type Mode } from "../api";
import { useI18n } from "../i18n";
import { useCountUp } from "../hooks";
import { IconAlert, IconArrow, IconPlay, IconX } from "../components/Icons";
import { AgentLog } from "./CaseDetail";
import { VERDICT_CLASS } from "./cells";

const EXPECTED_STEPS = 8;

export interface LiveRunProps {
  mode: Mode;
  target: { kind: "fresh" } | { kind: "rerun"; id: string };
  model: string | null;
  onRow: (row: QueueRow, phase: "start" | "done", caseFile?: CaseFile) => void;
  onOpen: (id: string) => void;
  onAgain: () => void;
  onClose: () => void;
}

export function LiveRun({ mode, target, model, onRow, onOpen, onAgain, onClose }: LiveRunProps) {
  const { t, reason, money, verdict } = useI18n();
  const [row, setRow] = useState<QueueRow | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [done, setDone] = useState<CaseFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const cbs = useRef({ onRow });
  cbs.current = { onRow };

  useEffect(() => {
    const ctl = new AbortController();
    const path = target.kind === "fresh" ? "/disputes/fresh" : `/disputes/${target.id}/run`;
    stream(
      mode,
      path,
      (e: StreamEvent) => {
        if (e.type === "dispute") {
          setRow(e.row);
          cbs.current.onRow(e.row, "start");
        } else if (e.type === "step") setSteps((s) => [...s, e.step]);
        else if (e.type === "done") {
          setRow(e.row);
          setDone(e.caseFile);
          cbs.current.onRow(e.row, "done", e.caseFile);
        } else if (e.type === "error") setError(e.message);
      },
      ctl.signal
    ).catch((e: Error) => {
      if (e.name !== "AbortError") setError(e.message);
    });
    return () => ctl.abort();
  }, [mode, target]);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [steps.length, done]);

  const progress = done ? 1 : Math.min(0.94, steps.length / EXPECTED_STEPS);
  const current = steps[steps.length - 1];
  const statusText = error ? t("error.title") : done ? t("live.done") : current ? (current.tool ? `${current.tool}…` : current.title) : t("live.starting");
  const score = useCountUp(done?.assessment.score ?? 0, 900);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="live-title" tabIndex={-1} ref={panel} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <div>
            <span className="eyebrow">{t("live.title")}</span>
            <h3 id="live-title">{row ? <span className="mono">{row.id}</span> : t("live.starting")}</h3>
            {row && (
              <p className="muted small">
                {reason(row.reason)} · {money(row.amount, row.currency)} · {row.buyerName}
              </p>
            )}
          </div>
          <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label={t("live.close")}>
            <IconX />
          </button>
        </header>

        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={statusText}>
          <span style={{ transform: `scaleX(${progress})` }} className={done ? "complete" : ""} />
        </div>
        <p className="progress-text" aria-live="polite">
          {!done && !error && <span className="live-dot" aria-hidden="true" />}
          <span className={current?.tool && !done ? "mono" : ""}>{statusText}</span>
          {steps.length > 0 && <span className="muted mono small">{t("live.step", { n: steps.length })}</span>}
        </p>

        {!model && <p className="note note-info small">{t("live.rulesNote")}</p>}

        <div className="sheet-body">
          {steps.length === 0 && !error && (
            <div style={{ display: "grid", gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="skel" style={{ height: 58, borderRadius: 12, opacity: 1 - i * 0.25 }} />
              ))}
            </div>
          )}
          <AgentLog steps={steps} live />
          {error && (
            <div className="error-card" role="alert">
              <IconAlert />
              <div>
                <strong>{t("error.title")}</strong>
                <p>{error}</p>
              </div>
            </div>
          )}
          {done && (
            <div className={`live-result verdict-${done.assessment.verdict}`}>
              <span className="live-score mono tnum">{Math.round(score)}</span>
              <div>
                <span className={`pill ${VERDICT_CLASS[done.assessment.verdict]}`}>
                  <span className="dot" />
                  {verdict(done.assessment.verdict)}
                </span>
                <p className="small" dir="auto">{done.assessment.rationale}</p>
              </div>
            </div>
          )}
          <div ref={logEnd} />
        </div>

        <footer className="sheet-foot">
          <button className="btn" onClick={onClose}>
            {t("live.close")}
          </button>
          {done && row && (
            <>
              {target.kind === "fresh" && (
                <button className="btn btn-ghost" onClick={onAgain}>
                  <IconPlay />
                  {t("live.again")}
                </button>
              )}
              <button className="btn btn-primary" onClick={() => onOpen(row.id)}>
                {t("live.open")}
                <IconArrow className="flip-rtl" />
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
