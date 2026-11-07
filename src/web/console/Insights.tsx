import { useEffect, useMemo, useRef, useState } from "react";
import type { GridApi } from "ag-grid-community";
import type { AgChartInstance, AgChartOptions } from "ag-charts-community";
import type { QueueRow, ReasonCode, Verdict } from "../../shared/types";
import { REASON_CODES } from "../../shared/playbook";
import { useI18n } from "../i18n";
import { useCountUp } from "../hooks";
import { useTheme } from "../theme";
import { IconX } from "../components/Icons";
import { CHART_THEMES, verdictColor } from "./chart-theme";
import type { GridRow } from "./cells";

type Charts = typeof import("./charts");
type Pick = { reason: string[] | null; verdict: string[] | null };
type Datum = { code: string; label: string; amount: number; count: number };

const OPEN = (r: QueueRow) => r.status === "needs_review" || r.status === "processing";
const VERDICTS: Verdict[] = ["strong", "weak", "concede"];
const ACCENT = { light: "#136f55", dark: "#52c99c" };
// Canvas text measurement trips over bidi control marks that some locales put in formatted numbers.
const plain = (s: string) => s.replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, "").replace(/\u00a0/g, " ");

// The chart engine is its own chunk; the queue never waits for it.
let lib: Promise<Charts> | null = null;
const loadCharts = () => (lib ??= import("./charts"));

function useChart(el: React.RefObject<HTMLDivElement | null>, charts: Charts | null, options: AgChartOptions) {
  const inst = useRef<AgChartInstance | null>(null);
  useEffect(() => {
    if (!charts || !el.current) return;
    const opts = { ...options, container: el.current } as AgChartOptions;
    if (!inst.current) inst.current = charts.AgCharts.create(opts);
    else inst.current.update(opts);
  }, [charts, options, el]);
  useEffect(
    () => () => {
      inst.current?.destroy();
      inst.current = null;
    },
    []
  );
}

/**
 * The queue at a glance: a score-weighted recovery forecast and two AG Charts views of the money
 * at stake. The charts and the grid share one filter: clicking a bar or slice writes the grid's
 * column filter, and a filter set from the grid's column headers highlights the charts in turn.
 */
export function Insights({ api, rows }: { api: GridApi<GridRow> | null; rows: QueueRow[] }) {
  const { t, money, verdict, reason } = useI18n();
  const { resolved } = useTheme();
  const [charts, setCharts] = useState<Charts | null>(null);
  const [pick, setPick] = useState<Pick>({ reason: null, verdict: null });
  const reasonEl = useRef<HTMLDivElement>(null);
  const verdictEl = useRef<HTMLDivElement>(null);
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    let live = true;
    loadCharts().then((m) => live && setCharts(m));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!api) return;
    const read = () => {
      const m = api.getFilterModel() as Record<string, string[] | null | undefined>;
      setPick({ reason: m.reason ?? null, verdict: m.verdict ?? null });
    };
    read();
    api.addEventListener("filterChanged", read);
    return () => {
      if (!api.isDestroyed()) api.removeEventListener("filterChanged", read);
    };
  }, [api]);

  const pickRef = useRef(pick);
  pickRef.current = pick;
  const choose = (col: "reason" | "verdict", value: string) => {
    const g = apiRef.current;
    if (!g || g.isDestroyed()) return;
    const cur = pickRef.current[col];
    const next = cur?.length === 1 && cur[0] === value ? null : [value];
    g.setColumnFilterModel(col, next).then(() => g.onFilterChanged());
  };
  const clear = () => {
    const g = apiRef.current;
    if (!g || g.isDestroyed()) return;
    Promise.all([g.setColumnFilterModel("reason", null), g.setColumnFilterModel("verdict", null)]).then(() => g.onFilterChanged());
  };

  const open = useMemo(() => rows.filter(OPEN), [rows]);
  const tip = (d: Datum) => plain(`${d.label}: ${money(d.amount)} · ${d.count}`);

  const reasonOpts = useMemo(() => {
    const pool = pick.verdict ? open.filter((r) => r.verdict && pick.verdict!.includes(r.verdict)) : open;
    const data: Datum[] = REASON_CODES.map((code) => {
      const rs = pool.filter((r) => r.reason === code);
      return { code, label: reason(code), amount: rs.reduce((a, r) => a + r.amount, 0), count: rs.length };
    })
      .filter((d) => d.count)
      .sort((a, b) => b.amount - a.amount);
    const chosen = pick.reason;
    return {
      theme: CHART_THEMES[`rb-${resolved}`],
      data,
      background: { visible: false },
      padding: { top: 4, right: 14, bottom: 4, left: 4 },
      legend: { enabled: false },
      series: [
        {
          type: "bar",
          direction: "horizontal",
          xKey: "label",
          yKey: "amount",
          cornerRadius: 6,
          itemStyler: ({ datum }: { datum: Datum }) => ({ fill: ACCENT[resolved], fillOpacity: chosen && !chosen.includes(datum.code) ? 0.25 : 1 }),
          tooltip: { renderer: ({ datum }: { datum: Datum }) => tip(datum) },
          listeners: { seriesNodeClick: ({ datum }: { datum: Datum }) => choose("reason", datum.code) },
        },
      ],
      axes: {
        x: { type: "category", position: "left", line: { enabled: false } },
        y: { type: "number", position: "bottom", label: { formatter: ({ value }: { value: number }) => plain(money(value)).replace(/[.,]00(?=\D*$)/, "") } },
      },
    } as unknown as AgChartOptions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pick, resolved, reason, money]);

  const verdictOpts = useMemo(() => {
    const pool = pick.reason ? open.filter((r) => pick.reason!.includes(r.reason)) : open;
    const data: Datum[] = VERDICTS.map((v) => {
      const rs = pool.filter((r) => r.verdict === v);
      return { code: v, label: verdict(v), amount: rs.reduce((a, r) => a + r.amount, 0), count: rs.length };
    }).filter((d) => d.count);
    const total = data.reduce((a, d) => a + d.amount, 0);
    const chosen = pick.verdict;
    const p = CHART_THEMES[`rb-${resolved}`].params!;
    return {
      theme: CHART_THEMES[`rb-${resolved}`],
      data,
      background: { visible: false },
      padding: { top: 4, right: 4, bottom: 4, left: 4 },
      legend: { position: "bottom", item: { marker: { shape: "circle" } } },
      series: [
        {
          type: "donut",
          angleKey: "amount",
          legendItemKey: "label",
          innerRadiusRatio: 0.66,
          cornerRadius: 4,
          sectorSpacing: 3,
          innerLabels: [
            { text: plain(money(total)).replace(/[.,]\d\d(?=\D*$)/, ""), fontSize: 22, fontWeight: 600, color: p.foregroundColor, fontFamily: "Fraunces, Georgia, serif" },
            { text: plain(`${data.reduce((a, d) => a + d.count, 0)} ${t("insights.open")}`), fontSize: 12, color: p.subtleTextColor, spacing: 4 },
          ],
          itemStyler: ({ datum }: { datum: Datum }) => ({ fill: verdictColor(resolved, datum.code), fillOpacity: chosen && !chosen.includes(datum.code) ? 0.25 : 1 }),
          tooltip: { renderer: ({ datum }: { datum: Datum }) => tip(datum) },
          listeners: { seriesNodeClick: ({ datum }: { datum: Datum }) => choose("verdict", datum.code) },
        },
      ],
    } as unknown as AgChartOptions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pick, resolved, verdict, money, t]);

  useChart(reasonEl, charts, reasonOpts);
  useChart(verdictEl, charts, verdictOpts);

  const f = useMemo(() => {
    const risk = open.reduce((a, r) => a + r.amount, 0);
    const contest = open.filter((r) => r.verdict === "strong" || r.verdict === "weak");
    const expected = contest.reduce((a, r) => a + r.amount * ((r.score ?? 0) / 100), 0);
    const found = open.reduce((a, r) => a + r.found, 0);
    const needed = open.reduce((a, r) => a + r.needed, 0);
    const by = Object.fromEntries(VERDICTS.map((v) => [v, open.filter((r) => r.verdict === v).reduce((a, r) => a + r.amount, 0)])) as Record<Verdict, number>;
    return { risk, expected, coverage: needed ? found / needed : 0, by };
  }, [open]);

  const expected = useCountUp(f.expected, 1200);
  const coverage = useCountUp(f.coverage * 100, 1200);
  const share = f.risk ? f.expected / f.risk : 0;
  const active = [...(pick.reason ?? []).map((c) => reason(c as ReasonCode)), ...(pick.verdict ?? []).map((v) => verdict(v as Verdict))];

  return (
    <section className="insights" aria-label={t("insights.title")}>
      <article className="ins-card ins-forecast card rise" style={{ ["--i" as string]: 0 }}>
        <span className="eyebrow">{t("insights.forecast")}</span>
        <span className="ins-big tnum">{money(expected)}</span>
        <span className="muted small">{t("insights.ofRisk", { v: money(f.risk) })}</span>
        <div className="ins-stack" role="img" aria-label={VERDICTS.map((v) => `${verdict(v)} ${money(f.by[v])}`).join(", ")}>
          {VERDICTS.map((v) => (
            <span key={v} className={`ins-seg ins-${v}`} style={{ ["--w" as string]: f.risk ? f.by[v] / f.risk : 0 }} />
          ))}
        </div>
        <ul className="ins-legend">
          {VERDICTS.map((v) => (
            <li key={v}>
              <span className={`ins-dot ins-${v}`} />
              {verdict(v)} <span className="mono tnum">{money(f.by[v])}</span>
            </li>
          ))}
        </ul>
        <div className="ins-meter">
          <svg viewBox="0 0 120 64" aria-hidden="true">
            <path d="M10 60 A50 50 0 0 1 110 60" className="ins-arc-track" pathLength={100} />
            <path d="M10 60 A50 50 0 0 1 110 60" className="ins-arc" pathLength={100} style={{ strokeDashoffset: 100 - coverage }} />
          </svg>
          <div>
            <strong className="tnum">{Math.round(coverage)}%</strong>
            <span className="muted small">{t("insights.coverage")}</span>
          </div>
        </div>
        <p className="ins-note small">
          {t("insights.forecastNote")} ({Math.round(share * 100)}%)
        </p>
      </article>
      <article className="ins-card card rise" style={{ ["--i" as string]: 1 }}>
        <h3 className="ins-title">{t("insights.byReason")}</h3>
        <div className="ins-chart" ref={reasonEl}>
          {!charts && <span className="skel ins-chart-skel" />}
        </div>
      </article>
      <article className="ins-card card rise" style={{ ["--i" as string]: 2 }}>
        <h3 className="ins-title">{t("insights.byVerdict")}</h3>
        <div className="ins-chart" ref={verdictEl}>
          {!charts && <span className="skel ins-chart-skel" />}
        </div>
        <div className="ins-foot">
          {active.length ? (
            <button className="filter-chip" onClick={clear}>
              <span dir="auto">{active.join(" · ")}</span>
              <IconX />
              <span className="sr-only">{t("insights.clear")}</span>
            </button>
          ) : (
            <p className="muted small ins-hint">{t("insights.hint")}</p>
          )}
        </div>
      </article>
    </section>
  );
}
