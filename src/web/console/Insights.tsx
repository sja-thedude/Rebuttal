import { useEffect, useMemo, useRef } from "react";
import type { ChartRef, GridApi } from "ag-grid-community";
import type { QueueRow, Verdict } from "../../shared/types";
import { useI18n } from "../i18n";
import { useCountUp } from "../hooks";
import { useTheme } from "../theme";
import { verdictColor } from "./chart-theme";

const OPEN = (r: QueueRow) => r.status === "needs_review" || r.status === "processing";
const VERDICTS: Verdict[] = ["strong", "weak", "concede"];

/**
 * Two AG Grid cross-filter charts over the queue, plus a score-weighted recovery forecast.
 * Clicking a bar or slice applies a set filter on the grid, so the charts are a way to
 * navigate the queue, not just a picture of it.
 */
export function Insights({ api, rows, charts }: { api: GridApi<QueueRow> | null; rows: QueueRow[]; charts: boolean }) {
  const { t, money, verdict } = useI18n();
  const { resolved } = useTheme();
  const reasonEl = useRef<HTMLDivElement>(null);
  const verdictEl = useRef<HTMLDivElement>(null);
  // The donut colours slices by verdict, but the chart only knows the translated label.
  const labelToVerdict = useRef<Record<string, Verdict>>({});
  labelToVerdict.current = Object.fromEntries(VERDICTS.map((v) => [verdict(v), v]));

  useEffect(() => {
    if (!api || !charts || !reasonEl.current || !verdictEl.current) return;
    const theme = `rb-${resolved}`;
    const refs: (ChartRef | undefined)[] = [];
    // Let the grid finish its first render so the chart sees every row.
    const raf = requestAnimationFrame(() => {
      if (api.isDestroyed()) return;
      refs.push(
        api.createCrossFilterChart({
          chartType: "bar",
          cellRange: { columns: ["reasonLabel", "amount"] },
          aggFunc: "sum",
          chartContainer: reasonEl.current!,
          chartThemeName: theme,
          suppressChartRanges: true,
          chartThemeOverrides: {
            common: { legend: { enabled: false }, padding: { top: 4, right: 12, bottom: 4, left: 4 } },
            bar: {
              axes: { number: { label: { formatter: (p: { value: number }) => money(p.value).replace(/\.00$/, "") } } },
              series: { tooltip: { renderer: (p: { datum: Record<string, number | string> }) => money(Number(p.datum.amount)) } },
            },
          },
        }),
        api.createCrossFilterChart({
          chartType: "donut",
          cellRange: { columns: ["verdictLabel", "amount"] },
          aggFunc: "sum",
          chartContainer: verdictEl.current!,
          chartThemeName: theme,
          suppressChartRanges: true,
          chartThemeOverrides: {
            common: { legend: { position: "bottom", item: { marker: { shape: "circle" } } }, padding: { top: 4, right: 4, bottom: 4, left: 4 } },
            donut: {
              series: {
                innerRadiusRatio: 0.62,
                innerRadiusOffset: 0,
                title: { enabled: false },
                calloutLabel: { enabled: false },
                sectorLabel: { enabled: false },
                itemStyler: (p: { datum: Record<string, string> }) => ({ fill: verdictColor(resolved, labelToVerdict.current[p.datum.verdictLabel] ?? "") }),
                tooltip: { renderer: (p: { datum: Record<string, number | string> }) => money(Number(p.datum.amount)) },
              },
            },
          },
        })
      );
    });
    return () => {
      cancelAnimationFrame(raf);
      refs.forEach((r) => {
        try {
          r?.destroyChart();
        } catch {
          /* grid already gone */
        }
      });
    };
  }, [api, charts, resolved, money]);

  const f = useMemo(() => {
    const open = rows.filter(OPEN);
    const risk = open.reduce((a, r) => a + r.amount, 0);
    const contest = open.filter((r) => r.verdict === "strong" || r.verdict === "weak");
    const expected = contest.reduce((a, r) => a + r.amount * ((r.score ?? 0) / 100), 0);
    const found = open.reduce((a, r) => a + r.found, 0);
    const needed = open.reduce((a, r) => a + r.needed, 0);
    const by = Object.fromEntries(VERDICTS.map((v) => [v, open.filter((r) => r.verdict === v).reduce((a, r) => a + r.amount, 0)])) as Record<Verdict, number>;
    return { risk, expected, coverage: needed ? found / needed : 0, by };
  }, [rows]);

  const expected = useCountUp(f.expected, 1200);
  const coverage = useCountUp(f.coverage * 100, 1200);
  const share = f.risk ? f.expected / f.risk : 0;

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
        <p className="ins-note small">{t("insights.forecastNote")} ({Math.round(share * 100)}%)</p>
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
        <p className="muted small ins-hint">{t("insights.hint")}</p>
      </article>
    </section>
  );
}
