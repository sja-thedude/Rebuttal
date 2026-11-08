import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  CellSpanModule,
  CellStyleModule,
  ClientSideRowModelApiModule,
  CustomFilterModule,
  EventApiModule,
  ClientSideRowModelModule,
  CsvExportModule,
  DateFilterModule,
  ExternalFilterModule,
  HighlightChangesModule,
  LocaleModule,
  ModuleRegistry,
  NumberFilterModule,
  QuickFilterModule,
  RenderApiModule,
  RowApiModule,
  RowAutoHeightModule,
  RowSelectionModule,
  ScrollApiModule,
  TextFilterModule,
  ValidationModule,
  themeQuartz, type ColDef, type ColGroupDef, type GetRowIdParams, type GridApi, type IRowNode, type RowHeightParams } from "ag-grid-community";
import { AG_GRID_LOCALE_EG, AG_GRID_LOCALE_ES, AG_GRID_LOCALE_FR } from "@ag-grid-community/locale";
import type { CaseFile, CaseStatus, QueueRow, WorkspaceInfo } from "../../shared/types";
import { api, type Mode } from "../api";
import { useI18n } from "../i18n";
import { useCountUp } from "../hooks";
import { useToast } from "../components/Toasts";
import { TopBar } from "../components/TopBar";
import { IllusEmptyQueue, IllusError } from "../components/Illustrations";
import { IconChart, IconCheck, IconClock, IconDownload, IconPlay, IconRefresh, IconSearch, IconX } from "../components/Icons";
import { BuyerCell, DueCell, EngineCell, EvidenceCell, GroupSpanCell, IdCell, ReasonCell, ScoreCell, StatusCell, VerdictCell, dueInfo, type GridRow } from "./cells";
import { DetailFullRow, detailHeight } from "./CaseDetail";
import { ChoiceFilter, choiceFilterPass } from "./ChoiceFilter";
import { REASON_CODES } from "../../shared/playbook";
import { Insights } from "./Insights";
import { Palette } from "./Palette";
import { ConsoleCtx, type ConsoleApi } from "./context";
import { LiveRun, type LiveRunProps } from "./LiveRun";
import "./console.css";

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ClientSideRowModelApiModule,
  EventApiModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  QuickFilterModule,
  ExternalFilterModule,
  RowSelectionModule,
  CsvExportModule,
  CellStyleModule,
  RowApiModule,
  RenderApiModule,
  ScrollApiModule,
  HighlightChangesModule,
  LocaleModule,
  RowAutoHeightModule,
  CustomFilterModule,
  CellSpanModule,
  ...(import.meta.env.DEV ? [ValidationModule] : []),
]);
// AG Studio is a large chunk; it loads only when the analytics view opens.
const Analytics = lazy(() => import("../studio/Analytics"));

const readInsights = () => {
  try {
    return localStorage.getItem("rb-insights") !== "0";
  } catch {
    return true;
  }
};


// Every colour is a theme token, so the grid re-tints with the page in light and dark mode.
const gridTheme = themeQuartz.withParams({
  backgroundColor: "var(--surface)",
  foregroundColor: "var(--ink)",
  textColor: "var(--ink)",
  subtleTextColor: "var(--muted)",
  accentColor: "var(--accent)",
  borderColor: "var(--line)",
  chromeBackgroundColor: "var(--surface-2)",
  headerBackgroundColor: "var(--surface-2)",
  headerTextColor: "var(--muted)",
  headerFontWeight: 600,
  headerFontSize: 12.5,
  rowHoverColor: "color-mix(in srgb, var(--accent) 5%, transparent)",
  selectedRowBackgroundColor: "color-mix(in srgb, var(--accent) 10%, transparent)",
  oddRowBackgroundColor: "var(--surface)",
  rowBorder: { color: "var(--line)" },
  columnBorder: false,
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  fontFamily: "var(--font-body)",
  fontSize: 14,
  spacing: 7,
  rowHeight: 58,
  headerHeight: 42,
  inputBorder: { color: "var(--line-strong)" },
  inputFocusBorder: { color: "var(--accent)" },
  menuBackgroundColor: "var(--surface)",
  menuBorder: { color: "var(--line)" },
  panelBackgroundColor: "var(--surface)",
  checkboxCheckedBackgroundColor: "var(--accent)",
  checkboxCheckedShapeColor: "var(--accent-ink)",
  browserColorScheme: "inherit",
  iconSize: 15,
});

type Filter = "all" | CaseStatus;
type Group = "none" | "reason" | "verdict";

const STATUS_FILTERS: Filter[] = ["all", "needs_review", "approved", "conceded"];

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ x: 0, w: 0 });
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>(`[data-v="${value}"]`);
    if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value, options.map((o) => o.label).join()]);
  return (
    <div className="seg" role="group" aria-label={label} ref={ref}>
      <span className="seg-thumb" style={{ left: thumb.x, width: thumb.w }} aria-hidden="true" />
      {options.map((o) => (
        <button key={o.v} data-v={o.v} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Kpi({ label, value, format, sub, tone, i }: { label: string; value: number; format?: (n: number) => string; sub?: string; tone?: string; i: number }) {
  const v = useCountUp(value);
  return (
    <div className={`kpi card rise${tone ? ` kpi-${tone}` : ""}`} style={{ ["--i" as string]: i }}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value tnum">{format ? format(v) : Math.round(v)}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

function NoRows() {
  const { t } = useI18n();
  return (
    <div className="state-panel">
      <IllusEmptyQueue />
      <h3>{t("empty.title")}</h3>
      <p>{t("empty.body")}</p>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid-skel" aria-hidden="true">
      <div className="grid-skel-head">
        {[90, 140, 120, 80, 110, 90].map((w, i) => (
          <span key={i} className="skel" style={{ width: w, height: 10 }} />
        ))}
      </div>
      {Array.from({ length: 9 }, (_, r) => (
        <div key={r} className="grid-skel-row" style={{ opacity: 1 - r * 0.08 }}>
          <span className="skel" style={{ width: 18, height: 18, borderRadius: 5 }} />
          <span className="skel" style={{ width: 110, height: 12 }} />
          <span style={{ display: "grid", gap: 6 }}>
            <span className="skel" style={{ width: 120, height: 11 }} />
            <span className="skel" style={{ width: 160, height: 9 }} />
          </span>
          <span className="skel" style={{ width: 120, height: 22, borderRadius: 999 }} />
          <span className="skel" style={{ width: 70, height: 12 }} />
          <span className="skel" style={{ width: 100, height: 22, borderRadius: 999 }} />
        </div>
      ))}
    </div>
  );
}

export default function Console() {
  const i18n = useI18n();
  const { t, reason, verdict, status, money, dir, lang } = i18n;
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(() => (new URLSearchParams(location.search).get("mode") === "sandbox" ? "sandbox" : "demo"));
  const [ws, setWs] = useState<WorkspaceInfo | null>(null);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [group, setGroup] = useState<Group>("none");
  const [selected, setSelected] = useState<string[]>([]);
  const [live, setLive] = useState<Omit<LiveRunProps, "mode" | "model" | "onRow" | "onOpen" | "onAgain" | "onClose">["target"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [liveKey, setLiveKey] = useState(0);
  const startLive = (target: NonNullable<typeof live>) => {
    setLiveKey((k) => k + 1);
    setLive(target);
  };
  const gridApi = useRef<GridApi<GridRow> | null>(null);
  const [grid, setGrid] = useState<GridApi<GridRow> | null>(null);
  const [view, setView] = useState<"queue" | "analytics">(() => (location.hash === "#analytics" ? "analytics" : "queue"));
  useEffect(() => {
    // The dashboard has its own agent chat, so the floating assistant steps aside there.
    document.body.dataset.view = view;
    return () => {
      delete document.body.dataset.view;
    };
  }, [view]);
  useEffect(() => {
    history.replaceState(null, "", view === "analytics" ? `${location.pathname}${location.search}#analytics` : `${location.pathname}${location.search}`);
  }, [view]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggleRow = useCallback((id: string, open?: boolean) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (open ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const [foot, setFoot] = useState({ shown: 0, sum: 0 });
  const [showInsights, setShowInsights] = useState(readInsights);
  const toggleInsights = () =>
    setShowInsights((v) => {
      try {
        localStorage.setItem("rb-insights", v ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !v;
    });

  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      } else if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>(".toolbar .search input")?.focus();
      }
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, []);
  const openRef = useRef<(id: string) => void>(() => {});
  const reloadRef = useRef<() => void>(() => {});
  useEffect(() => {
    const on = (e: Event) => openRef.current((e as CustomEvent<string>).detail);
    const reload = () => reloadRef.current();
    addEventListener("rb:open-case", on);
    addEventListener("rb:reload", reload);
    return () => {
      removeEventListener("rb:open-case", on);
      removeEventListener("rb:reload", reload);
    };
  }, []);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const [narrow, setNarrow] = useState(() => innerWidth < 760);

  useEffect(() => {
    const on = () => setNarrow(innerWidth < 760);
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    setWs(null);
    try {
      const info = await api.workspace(mode);
      setWs(info);
      setRows(info.rows);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [mode]);

  useEffect(() => {
    load();
    const url = new URL(location.href);
    if (mode === "sandbox") url.searchParams.set("mode", "sandbox");
    else url.searchParams.delete("mode");
    history.replaceState(null, "", url);
  }, [load, mode]);

  useEffect(() => {
    document.title = `${t("nav.console")} · Rebuttal`;
  }, [t]);

  const flash = (id: string) => {
    const node = gridApi.current?.getRowNode(id);
    if (node) gridApi.current?.flashCells({ rowNodes: [node], flashDuration: 900, fadeDuration: 900 });
  };

  const upsert = useCallback((row: QueueRow) => {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.id === row.id);
      if (i < 0) return [row, ...rs];
      const copy = rs.slice();
      copy[i] = row;
      return copy;
    });
    requestAnimationFrame(() => flash(row.id));
  }, []);

  const consoleApi = useMemo<ConsoleApi>(
    () => ({
      mode,
      model: ws?.model ?? null,
      onCaseChanged: (id, c: CaseFile) => {
        setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: c.status, verdict: c.assessment.verdict, score: c.assessment.score } : r)));
        requestAnimationFrame(() => flash(id));
      },
      rerun: (id) => {
        setLiveKey((k) => k + 1);
        setLive({ kind: "rerun", id });
      },
      expanded,
      toggleRow,
    }),
    [mode, ws?.model, expanded, toggleRow]
  );

  // Community master/detail: an open case is a full-width row placed right after its dispute.
  // It copies the dispute's fields, so every sort, filter and quick search treats the pair alike.
  const rowData = useMemo<GridRow[]>(
    () => rows.flatMap((r) => (expanded.has(r.id) && r.status !== "processing" ? [r, { ...r, id: `${r.id}::detail`, detailOf: r.id }] : [r])),
    [rows, expanded]
  );

  const choice = useCallback(<T extends string>(values: readonly T[], format: (v: T) => string) => ({ filter: { component: ChoiceFilter, doesFilterPass: choiceFilterPass }, filterParams: { values, format } }), []);
  const VERDICT_RANK: Record<string, number> = { strong: 0, weak: 1, concede: 2 };

  const columnDefs = useMemo<(ColDef<GridRow> | ColGroupDef<GridRow>)[]>(
    () => [
      ...(group !== "none"
        ? [
            {
              colId: "group",
              headerName: group === "reason" ? t("col.reason") : t("col.verdict"),
              valueGetter: (p: { data?: GridRow }) => (p.data ? (group === "reason" ? p.data.reason : p.data.verdict ?? "") : ""),
              cellRenderer: GroupSpanCell,
              cellRendererParams: { field: group },
              spanRows: true,
              sort: "asc" as const,
              sortIndex: 0,
              comparator: group === "verdict" ? (a: string, b: string) => (VERDICT_RANK[a] ?? 9) - (VERDICT_RANK[b] ?? 9) : undefined,
              pinned: narrow ? undefined : dir === "rtl" ? ("right" as const) : ("left" as const),
              minWidth: 210,
              maxWidth: 260,
              cellClass: "group-span-cell",
              suppressMovable: true,
            } satisfies ColDef<GridRow>,
          ]
        : []),
      {
        headerName: t("col.dispute"),
        children: [
          { field: "id", headerName: t("col.id"), cellRenderer: IdCell, minWidth: 196, flex: narrow ? 1 : undefined, filter: "agTextColumnFilter" },
          { field: "buyerName", headerName: t("col.buyer"), cellRenderer: BuyerCell, minWidth: 170, flex: 1.2, hide: narrow, getQuickFilterText: (p) => `${p.data?.buyerName} ${p.data?.buyerEmail}`, filter: "agTextColumnFilter" },
          {
            field: "reason",
            headerName: t("col.reason"),
            cellRenderer: ReasonCell,
            minWidth: 170,
            flex: 1,
            hide: group === "reason" || narrow,
            ...choice(REASON_CODES, reason),
            getQuickFilterText: (p) => reason(p.value),
            valueFormatter: (p) => (p.value ? reason(p.value) : ""),
          },
          { field: "stage", headerName: t("col.stage"), minWidth: 120, hide: true, valueFormatter: (p) => (p.value ? t(`stage.${p.value}` as never) : ""), ...choice(["INQUIRY", "CHARGEBACK", "PRE_ARBITRATION", "ARBITRATION"] as const, (v) => t(`stage.${v}` as never)) },
        ],
      },
      {
        headerName: t("col.money"),
        children: [
          { field: "amount", headerName: t("col.amount"), type: "rightAligned", minWidth: 124, cellClass: "mono tnum", valueFormatter: (p) => (p.data ? money(p.value, p.data.currency) : ""), filter: "agNumberColumnFilter" },
        ],
      },
      {
        headerName: t("col.deadline"),
        children: [{ field: "responseDueAt", headerName: t("col.due"), cellRenderer: DueCell, minWidth: 140, sort: "asc", sortIndex: 1, filter: "agDateColumnFilter", filterParams: { comparator: (f: Date, v: string) => Date.parse(v) - f.getTime() } }],
      },
      {
        headerName: t("col.assessment"),
        children: [
          {
            field: "verdict",
            headerName: t("col.verdict"),
            cellRenderer: VerdictCell,
            minWidth: 140,
            hide: group === "verdict",
            ...choice(["strong", "weak", "concede"] as const, verdict),
            getQuickFilterText: (p) => (p.value ? verdict(p.value) : ""),
            valueFormatter: (p) => (p.value ? verdict(p.value) : ""),
          },
          { field: "score", headerName: t("col.score"), cellRenderer: ScoreCell, minWidth: 150, hide: narrow, filter: "agNumberColumnFilter" },
          { colId: "evidence", headerName: t("col.evidence"), valueGetter: (p) => (p.data ? p.data.found / Math.max(1, p.data.needed) : null), cellRenderer: EvidenceCell, minWidth: 140, hide: true, valueFormatter: (p) => (p.data ? `${p.data.found}/${p.data.needed}` : "") },
        ],
      },
      {
        headerName: t("col.review"),
        children: [
          { field: "status", headerName: t("col.status"), cellRenderer: StatusCell, minWidth: 136, hide: narrow, ...choice(["needs_review", "approved", "conceded", "settled", "filed", "processing"] as const, status), valueFormatter: (p) => (p.value ? status(p.value) : ""), getQuickFilterText: (p) => status(p.value) },
          { field: "engine", headerName: t("col.engine"), cellRenderer: EngineCell, minWidth: 140, hide: true },
        ],
      },
    ],
    [t, reason, verdict, status, money, group, narrow, dir, choice]
  );

  const defaultColDef = useMemo<ColDef>(() => ({ flex: 1, minWidth: 110, sortable: true, resizable: true, suppressHeaderMenuButton: false, enableCellChangeFlash: false }), []);
  const localeText = useMemo(() => (lang === "ar" ? AG_GRID_LOCALE_EG : lang === "fr" ? AG_GRID_LOCALE_FR : lang === "es" ? AG_GRID_LOCALE_ES : undefined), [lang]);

  useEffect(() => {
    gridApi.current?.onFilterChanged();
  }, [filter]);

  const kpis = useMemo(() => {
    const now = Date.now();
    const open = rows.filter((r) => r.status === "needs_review" || r.status === "processing");
    return {
      open: open.length,
      due: open.filter((r) => dueInfo(r.responseDueAt, now).h < 48).length,
      risk: open.reduce((a, r) => a + r.amount, 0),
      contest: open.filter((r) => r.verdict === "strong" || r.verdict === "weak").length,
      concede: open.filter((r) => r.verdict === "concede").length,
      decided: rows.length - open.length,
    };
  }, [rows]);

  const exportCsv = () =>
    gridApi.current?.exportDataAsCsv({
      shouldRowBeSkipped: (p) => !!p.node.data?.detailOf,
      fileName: `rebuttal-disputes-${new Date().toISOString().slice(0, 10)}.csv`,
      columnKeys: ["id", "buyerName", "reason", "stage", "amount", "responseDueAt", "verdict", "score", "evidence", "status"],
      processCellCallback: (p) => {
        const id = p.column.getColId();
        if (id === "amount") return String(p.value);
        if (id === "evidence") return p.node?.data ? `${p.node.data.found}/${p.node.data.needed}` : "";
        if (id === "reason" || id === "verdict" || id === "status" || id === "stage") return p.formatValue ? p.formatValue(p.value) : p.value;
        return p.value ?? "";
      },
    });

  const bulk = async (action: "approve" | "concede") => {
    setBusy(true);
    try {
      const res = await api.bulk(mode, selected, action);
      const nextStatus: CaseStatus = mode === "sandbox" ? "filed" : action === "approve" ? "approved" : "conceded";
      setRows((rs) => rs.map((r) => (res.done.includes(r.id) ? { ...r, status: nextStatus } : r)));
      toast(t("toast.bulk", { n: res.done.length }));
      if (res.failed.length) toast(`${res.failed.length}: ${res.failed[0].message}`, true);
      gridApi.current?.deselectAll();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      setWs(null);
      const info = await api.reset(mode);
      setWs(info);
      setRows(info.rows);
      toast(t("toast.reset"));
    } catch (e) {
      toast((e as Error).message, true);
      load();
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const r = await api.sync(mode);
      toast(t("ws.synced", { n: r.total }));
      await load();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const openCase = (id: string) => {
    setLive(null);
    setView("queue");
    setFilter("all");
    setQuick("");
    gridApi.current?.setFilterModel(null);
    toggleRow(id, true);
    requestAnimationFrame(() => {
      const node = gridApi.current?.getRowNode(id);
      if (!node) return;
      gridApi.current?.ensureNodeVisible(node, "top");
      flash(id);
    });
  };

  openRef.current = openCase;
  // After the assistant runs a confirmed action, refresh rows in place without the loading skeleton.
  reloadRef.current = () =>
    api.workspace(mode).then(
      (info) => {
        setRows(info.rows);
        requestAnimationFrame(() => info.rows.forEach((r) => flash(r.id)));
      },
      () => {}
    );

  return (
    <ConsoleCtx.Provider value={consoleApi}>
      <TopBar variant="console" />
      <main id="main" className="console view">
        <div className="console-head rise">
          <div>
            <div className="ws-chips">
              {ws?.sandboxAvailable ? (
                <Seg
                  label="Workspace"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { v: "demo", label: t("ws.demo") },
                    { v: "sandbox", label: t("ws.sandbox") },
                  ]}
                />
              ) : (
                <span className="pill pill-accent">
                  <span className="dot" />
                  {t("ws.demo")} · {t("ws.demoNote")}
                </span>
              )}
              {ws && <span className="pill">{ws.model ? t("ws.engineModel", { model: ws.model.split("/").pop() ?? ws.model }) : t("ws.engineRules")}</span>}
            </div>
            <h1>{ws?.merchant ?? <span className="skel" style={{ display: "inline-block", width: 280, height: 34 }} />}</h1>
            <p className="console-sub">{mode === "demo" ? t("ws.seededBanner") : t("ws.sandboxBanner")}</p>
          </div>
          <div className="console-head-actions">
            {mode === "sandbox" ? (
              <button className="btn" onClick={sync} disabled={busy}>
                <IconRefresh />
                {t("ws.sync")}
              </button>
            ) : (
              <button className="btn btn-ghost" onClick={reset} disabled={busy || !ws}>
                <IconRefresh />
                {t("ws.reset")}
              </button>
            )}
            {mode === "demo" && (
              <button className="btn btn-primary btn-lg live-cta" onClick={() => startLive({ kind: "fresh" })} disabled={!ws || ws.liveRunsLeft === 0}>
                <IconPlay />
                {t("toolbar.live")}
              </button>
            )}
          </div>
        </div>

        {loadError ? (
          <div className="card state-panel" role="alert">
            <IllusError />
            <h3>{t("error.title")}</h3>
            <p>{loadError || t("error.load")}</p>
            <div className="state-actions">
              <button className={`btn${mode === "sandbox" ? "" : " btn-primary"}`} onClick={load}>
                {t("error.retry")}
              </button>
              {mode === "sandbox" && (
                <button className="btn btn-primary" onClick={() => setMode("demo")}>
                  {t("error.toDemo")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <Seg
              label="View"
              value={view}
              onChange={setView}
              options={[
                { v: "queue", label: t("view.queue") },
                { v: "analytics", label: `${t("view.analytics")} · AG Studio` },
              ]}
            />
            <section className="kpis" aria-label="Summary">
              {ws ? (
                <>
                  <Kpi i={0} label={t("kpi.open")} value={kpis.open} sub={t("kpi.reviewed", { n: kpis.decided })} />
                  <Kpi i={1} label={t("kpi.due")} value={kpis.due} tone={kpis.due ? "urgent" : undefined} sub={ws.liveRunsLeft != null ? t("ws.runsLeft", { n: ws.liveRunsLeft }) : undefined} />
                  <Kpi i={2} label={t("kpi.risk")} value={kpis.risk} format={(n) => money(n)} />
                  <Kpi i={3} label={t("kpi.contest")} value={kpis.contest} tone="accent" sub={t("kpi.concede", { n: kpis.concede })} />
                </>
              ) : (
                [0, 1, 2, 3].map((i) => (
                  <div key={i} className="kpi card">
                    <span className="skel" style={{ width: 90, height: 11 }} />
                    <span className="skel" style={{ width: 70, height: 30, marginTop: 10 }} />
                    <span className="skel" style={{ width: 110, height: 10, marginTop: 10 }} />
                  </div>
                ))
              )}
            </section>

            {view === "analytics" ? (
              <Suspense fallback={<div className="card analytics-loading"><span className="skel" style={{ height: 520, borderRadius: 18 }} /></div>}>
                <Analytics mode={mode} />
              </Suspense>
            ) : (
              <>
            <div id="insights" className={`insights-wrap${showInsights && ws ? " open" : ""}`} aria-hidden={!showInsights}>
              <div>{ws && showInsights && <Insights api={grid} rows={rows} />}</div>
            </div>

            <section className="queue card rise" style={{ ["--i" as string]: 2 }} aria-label="Dispute queue">
              <div className="toolbar">
                <label className="search">
                  <IconSearch />
                  <span className="sr-only">{t("toolbar.search")}</span>
                  <input className="input" type="search" placeholder={t("toolbar.search")} value={quick} onChange={(e) => setQuick(e.target.value)} />
                  <kbd className="search-kbd" aria-hidden="true">/</kbd>
                </label>
                <button className="btn btn-ghost palette-trigger" onClick={() => setPalette(true)} aria-label={t("palette.open")} title={t("palette.open")}>
                  <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
                </button>
                <Seg label="Status" value={filter} onChange={setFilter} options={STATUS_FILTERS.map((f) => ({ v: f, label: f === "all" ? t("toolbar.filterAll") : status(f) }))} />
                <span className="spacer" />
                <Seg
                  label={t("toolbar.group")}
                  value={group}
                  onChange={setGroup}
                  options={[
                    { v: "none", label: t("toolbar.groupNone") },
                    { v: "reason", label: t("toolbar.groupReason") },
                    { v: "verdict", label: t("toolbar.groupVerdict") },
                  ]}
                />
                <button className="btn btn-ghost" onClick={toggleInsights} aria-pressed={showInsights} aria-controls="insights">
                  <IconChart />
                  {t("insights.toggle")}
                </button>
                <button className="btn" onClick={exportCsv} disabled={!ws}>
                  <IconDownload />
                  {t("toolbar.export")}
                </button>
              </div>

              <div className={`bulkbar${selected.length ? " show" : ""}`} aria-hidden={!selected.length}>
                <strong>{t("toolbar.selected", { n: selected.length })}</strong>
                <span className="spacer" />
                <button className="btn btn-sm btn-ghost" onClick={() => gridApi.current?.deselectAll()} tabIndex={selected.length ? 0 : -1}>
                  <IconX />
                  {t("toolbar.clear")}
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => bulk("concede")} disabled={busy} tabIndex={selected.length ? 0 : -1}>
                  {t("toolbar.concedeSel")}
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => bulk("approve")} disabled={busy} tabIndex={selected.length ? 0 : -1}>
                  <IconCheck />
                  {t("toolbar.approveSel")}
                </button>
              </div>

              <div className="grid-wrap">
                {!ws ? (
                  <GridSkeleton />
                ) : (
                  <AgGridReact<GridRow>
                    key={`${lang}-${group}`}
                    theme={gridTheme}
                    rowData={rowData}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    getRowId={(p: GetRowIdParams<GridRow>) => p.data.id}
                    context={{ model: ws.model }}
                    enableRtl={dir === "rtl"}
                    localeText={localeText}
                    quickFilterText={quick}
                    isExternalFilterPresent={() => filter !== "all"}
                    doesExternalFilterPass={(n: IRowNode<GridRow>) => (filter === "all" ? true : n.data?.status === filter)}
                    isFullWidthRow={(p) => !!p.rowNode.data?.detailOf}
                    fullWidthCellRenderer={DetailFullRow}
                    getRowHeight={(p: RowHeightParams<GridRow>) => (p.data?.detailOf ? detailHeight(p.data.detailOf) : undefined)}
                    postSortRows={({ nodes }) => {
                      const details = new Map<string, IRowNode<GridRow>>();
                      const masters = nodes.filter((n) => (n.data?.detailOf ? (details.set(n.data.detailOf, n), false) : true));
                      nodes.length = 0;
                      for (const n of masters) {
                        nodes.push(n);
                        const d = details.get(n.data!.id);
                        if (d) nodes.push(d);
                      }
                    }}
                    enableCellSpan={group !== "none"}
                    enableFilterHandlers
                    rowSelection={{ mode: "multiRow", checkboxes: (p) => !p.data?.detailOf, headerCheckbox: true, enableClickSelection: false, isRowSelectable: (n) => n.data?.status === "needs_review" && !n.data.detailOf }}
                    selectionColumnDef={{ pinned: narrow ? undefined : dir === "rtl" ? "right" : "left", width: 52, minWidth: 52, maxWidth: 52 }}
                    onSelectionChanged={(e) => setSelected(e.api.getSelectedRows().map((r) => r.id))}
                    onModelUpdated={(e) => {
                      let shown = 0;
                      let sum = 0;
                      e.api.forEachNodeAfterFilter((n) => {
                        if (n.data && !n.data.detailOf) {
                          shown++;
                          sum += n.data.amount;
                        }
                      });
                      setFoot((f) => (f.shown === shown && f.sum === sum ? f : { shown, sum }));
                    }}
                    onGridReady={(e) => {
                      gridApi.current = e.api;
                      setGrid(e.api);
                    }}
                    onGridPreDestroyed={() => {
                      gridApi.current = null;
                      setGrid(null);
                    }}
                    animateRows
                    noRowsOverlayComponent={NoRows}
                    suppressCellFocus={false}
                    tooltipShowDelay={300}
                  />
                )}
              </div>
              {ws && (
                <div className="grid-foot small" aria-live="polite">
                  <span>{t("foot.shown", { n: foot.shown, total: rows.length })}</span>
                  {selected.length > 0 && <span>{t("toolbar.selected", { n: selected.length })}</span>}
                  <span className="spacer" />
                  <span>
                    {t("foot.sum")} <strong className="mono tnum">{money(foot.sum)}</strong>
                  </span>
                </div>
              )}
            </section>
              </>
            )}
            <p className="legal small">
              <IconClock /> {t("ws.notLegal")}
            </p>
          </>
        )}
      </main>
      {palette && (
        <Palette
          rows={rows}
          onClose={() => setPalette(false)}
          onOpenCase={openCase}
          onLive={mode === "demo" && ws && ws.liveRunsLeft > 0 ? () => startLive({ kind: "fresh" }) : undefined}
          onExport={exportCsv}
          onInsights={toggleInsights}
        />
      )}
      {live && ws && (
        <LiveRun
          key={liveKey}
          mode={mode}
          target={live}
          model={ws.model}
          onRow={(row) => upsert(row)}
          onOpen={openCase}
          onAgain={() => startLive({ kind: "fresh" })}
          onClose={() => setLive(null)}
        />
      )}
    </ConsoleCtx.Provider>
  );
}
