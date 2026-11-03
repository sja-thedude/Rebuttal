import { useEffect, useState } from "react";
import type { CustomCellRendererProps } from "ag-grid-react";
import type { QueueRow, ReasonCode, Verdict } from "../../shared/types";
import { useI18n } from "../i18n";

type P = CustomCellRendererProps<QueueRow>;

export const VERDICT_CLASS: Record<Verdict, string> = { strong: "pill-strong", weak: "pill-weak", concede: "pill-concede" };

export const REASON_GLYPH: Record<ReasonCode, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "M4 5h16v14H4z M8 9h8 M8 13h5",
  UNAUTHORISED: "M6 10V8a6 6 0 0 1 12 0v2 M5 10h14v10H5z M12 14v2",
  DUPLICATE_TRANSACTION: "M8 8h12v12H8z M4 4h12v2 M4 4v12h2",
  CREDIT_NOT_PROCESSED: "M3 12a9 9 0 1 0 3-6.7 M3 4v5h5",
  INCORRECT_AMOUNT: "M12 3v18 M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6",
  CANCELED_RECURRING_BILLING: "M4 6h16v14H4z M4 10h16 M9 14l6 4 M15 14l-6 4",
  PAYMENT_BY_OTHER_MEANS: "M3 7h18v10H3z M3 11h18 M7 15h3",
};

export function ReasonGlyph({ code }: { code: ReasonCode }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={REASON_GLYPH[code]} />
    </svg>
  );
}

export function IdCell({ data }: P) {
  if (!data) return null;
  return (
    <span className="cell-id">
      <span className="mono">{data.id}</span>
      {data.origin === "seeded" ? <span className="tag-seeded">seeded</span> : <span className="tag-live">sandbox</span>}
    </span>
  );
}

export function BuyerCell({ data }: P) {
  if (!data) return null;
  return (
    <span className="cell-two">
      <span className="cell-two-main">{data.buyerName}</span>
      <span className="cell-two-sub">{data.buyerEmail}</span>
    </span>
  );
}

export function ReasonCell({ data }: P) {
  const { reason } = useI18n();
  if (!data) return null;
  return (
    <span className="cell-reason">
      <ReasonGlyph code={data.reason} />
      {reason(data.reason)}
    </span>
  );
}

export function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function dueInfo(iso: string, now: number) {
  const h = (Date.parse(iso) - now) / 3600_000;
  const level = h <= 0 ? "over" : h < 24 ? "urgent" : h < 72 ? "soon" : "calm";
  return { h, level };
}

export function DueCell({ data }: P) {
  const { t } = useI18n();
  const now = useNow();
  if (!data) return null;
  const { h, level } = dueInfo(data.responseDueAt, now);
  const label = h <= 0 ? t("due.overdue") : h < 48 ? t("due.hours", { n: Math.floor(h) }) : t("due.days", { n: Math.floor(h / 24) });
  const pct = Math.max(4, Math.min(100, 100 - (h / 240) * 100));
  return (
    <span className={`cell-due due-${level}`}>
      <span className="cell-due-label">{label}</span>
      <span className="cell-due-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

export function VerdictCell({ data }: P) {
  const { verdict, status } = useI18n();
  if (!data) return null;
  if (!data.verdict)
    return (
      <span className="pill pill-info pill-processing">
        <span className="dot" />
        {status("processing")}
      </span>
    );
  return (
    <span className={`pill ${VERDICT_CLASS[data.verdict]}`}>
      <span className="dot" />
      {verdict(data.verdict)}
    </span>
  );
}

export function ScoreCell({ data }: P) {
  if (!data || data.score == null) return <span className="skel" style={{ width: 80, height: 8, display: "inline-block" }} />;
  const cls = data.score >= 70 ? "strong" : data.score >= 40 ? "weak" : "concede";
  return (
    <span className={`cell-score score-${cls}`}>
      <span className="cell-score-top">
        <span className="cell-score-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${data.score / 100})` }} />
        </span>
        <span className="mono tnum">{data.score}</span>
      </span>
      {data.needed > 0 && (
        <span className="cell-score-ev" aria-label={`${data.found} of ${data.needed} evidence items found`}>
          <span className="dots" aria-hidden="true">
            {Array.from({ length: data.needed }, (_, i) => (
              <span key={i} className={i < data.found ? "on" : ""} style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </span>
          <span className="mono tnum">{data.found}/{data.needed}</span>
        </span>
      )}
    </span>
  );
}

export function EvidenceCell({ data }: P) {
  if (!data || !data.needed) return null;
  return (
    <span className="cell-evidence" aria-label={`${data.found} of ${data.needed} evidence items found`}>
      <span className="dots" aria-hidden="true">
        {Array.from({ length: data.needed }, (_, i) => (
          <span key={i} className={i < data.found ? "on" : ""} style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </span>
      <span className="mono tnum">
        {data.found}/{data.needed}
      </span>
    </span>
  );
}

const STATUS_CLASS = { needs_review: "", approved: "pill-strong", conceded: "pill-concede", filed: "pill-accent", processing: "pill-info pill-processing" } as const;

export function StatusCell({ data }: P) {
  const { status } = useI18n();
  if (!data) return null;
  return (
    <span className={`pill ${STATUS_CLASS[data.status]}`}>
      <span className="dot" />
      {status(data.status)}
    </span>
  );
}

export function EngineCell({ data, context }: P) {
  const { t } = useI18n();
  if (!data?.engine) return null;
  const model = (context as { model?: string | null } | undefined)?.model ?? "model";
  return <span className="cell-engine">{data.engine === "model" ? t("ws.engineModel", { model: model.split("/").pop() ?? model }) : t("ws.engineRules")}</span>;
}

export function GroupInner(p: CustomCellRendererProps<QueueRow>) {
  const { reason, verdict, money } = useI18n();
  const node = p.node;
  const leaves = (node.allLeafChildren ?? []).map((n) => n.data).filter(Boolean) as QueueRow[];
  const total = leaves.reduce((a, r) => a + r.amount, 0);
  const key = String(node.key ?? "");
  const label = node.field === "reason" ? reason(key as ReasonCode) : node.field === "verdict" ? verdict(key as Verdict) : key;
  return (
    <span className="group-inner">
      {node.field === "reason" && <ReasonGlyph code={key as ReasonCode} />}
      {node.field === "verdict" && <span className={`pill ${VERDICT_CLASS[key as Verdict] ?? ""}`}><span className="dot" />{label}</span>}
      {node.field !== "verdict" && <strong>{label}</strong>}
      <span className="group-count mono">{leaves.length}</span>
      <span className="group-total mono">{money(total)}</span>
    </span>
  );
}
