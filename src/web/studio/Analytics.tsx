import { useEffect, useMemo, useState } from "react";
import { AgStudio, AgStudioProvider, createWidgets } from "ag-studio-react";
import {
  AgStudioAiModule,
  createAiHarness,
  directLlmRunner,
  studioTheme,
  type AgAiHarnessSetup,
  type AgAiPromptStarter,
  type AgDataSourcesDefinition,
  type AgReportState,
  type AgStudioApi,
} from "ag-studio";
import { api as http, type Mode } from "../api";
import { useI18n } from "../i18n";
import { useTheme } from "../theme";
import { IconRefresh, IconSpark } from "../components/Icons";
import { openaiAdapter } from "./responsesAdapter";
import DeadlineRadar from "./DeadlineRadar";
import "./analytics.css";

const LICENSE = import.meta.env.VITE_AG_STUDIO_LICENSE_KEY as string | undefined;
const MODULES = [AgStudioAiModule];

// The browser-side adapter talks to Rebuttal's proxy; the server adds the key and picks the model.
const adapter = openaiAdapter({ endpoint: "/api/studio", model: "rebuttal" });

type Row = Record<string, unknown>;
interface Tables {
  disputes: Row[];
  evidence: Row[];
}

const usd = { format: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) };

function sources({ disputes, evidence }: Tables): AgDataSourcesDefinition {
  return {
    description: "PayPal disputes worked by Rebuttal's agent, with one row per evidence requirement the agent checked.",
    sources: [
      {
        id: "disputes",
        name: "Disputes",
        description: "One row per PayPal dispute: reason, money at stake, deadline, the agent's verdict and evidence score.",
        data: disputes,
        fields: [
          { id: "id", name: "Dispute ID", format: "textFormat" },
          { id: "reason", name: "Reason", format: "textFormat" },
          { id: "stage", name: "Stage", format: "textFormat" },
          { id: "amount", name: "Amount at stake", format: "currencyFormat", formatOptions: usd },
          { id: "currency", name: "Currency", format: "textFormat" },
          { id: "buyer", name: "Buyer", format: "textFormat" },
          { id: "created", name: "Opened", format: "dateFormat" },
          { id: "due", name: "Response due", format: "dateFormat" },
          { id: "hoursLeft", name: "Hours left", format: "integerFormat" },
          { id: "verdict", name: "Verdict", format: "textFormat" },
          { id: "score", name: "Evidence score", format: "integerFormat" },
          { id: "status", name: "Status", format: "textFormat" },
          { id: "open", name: "Open or decided", format: "textFormat" },
          { id: "evidenceFound", name: "Evidence found", format: "integerFormat" },
          { id: "evidenceNeeded", name: "Evidence needed", format: "integerFormat" },
          { id: "coverage", name: "Evidence coverage", format: "percentageFormat" },
          { id: "expectedRecovery", name: "Expected recovery", format: "currencyFormat", formatOptions: usd },
          { id: "engine", name: "Worked by", format: "textFormat" },
          { id: "source", name: "Data source", format: "textFormat" },
        ],
      },
      {
        id: "evidence",
        name: "Evidence checks",
        description: "One row per evidence requirement the agent checked for a dispute, with whether it was found in the record.",
        data: evidence,
        fields: [
          { id: "id", name: "Check ID", format: "textFormat" },
          { id: "disputeId", name: "Dispute ID", format: "textFormat" },
          { id: "requirement", name: "Evidence requirement", format: "textFormat" },
          { id: "status", name: "Result", format: "textFormat" },
          { id: "critical", name: "Importance", format: "textFormat" },
          { id: "weight", name: "Weight", format: "integerFormat" },
        ],
      },
    ],
    relationships: [{ id: "evidence-dispute", source: "evidence.disputeId", target: "disputes.id", type: "many-to-one" }],
  } as unknown as AgDataSourcesDefinition;
}

const title = (text: string) => ({ title: { text, enabled: true } });

// The dashboard a merchant opens on. Everything here stays editable, by hand or by the agents.
const REPORT: AgReportState = {
  pages: [
    {
      id: "overview",
      name: "Overview",
      widgets: {
        kpis: { type: "multi-kpi", format: title("Your dispute book"), dataMapping: { values: [{ id: "disputes.amount", aggregation: "sum" }, { id: "disputes.expectedRecovery", aggregation: "sum" }, { id: "disputes.id", aggregation: "count" }, { id: "disputes.score", aggregation: "avg" }] } },
        byReason: { type: "bar-chart-grouped", format: title("Money at stake by reason"), dataMapping: { categoryKey: [{ id: "disputes.reason" }], valueKey: [{ id: "disputes.amount", aggregation: "sum" }], tooltipKey: [] } },
        byVerdict: { type: "donut-chart", format: title("Agent verdicts"), dataMapping: { categoryKey: [{ id: "disputes.verdict" }], valueKey: [{ id: "disputes.amount", aggregation: "sum" }], tooltipKey: [] } },
        coverage: { type: "radial-gauge", format: title("Evidence coverage"), dataMapping: { value: [{ id: "disputes.coverage", aggregation: "avg" }] } },
        recovery: { type: "column-chart-stacked", format: title("Expected recovery by reason and verdict"), dataMapping: { categoryKey: [{ id: "disputes.reason" }], valueKey: [{ id: "disputes.expectedRecovery", aggregation: "sum" }], legendKey: [{ id: "disputes.verdict" }], tooltipKey: [] } },
        table: { type: "grid", format: title("Disputes"), dataMapping: { cols: [{ id: "disputes.id" }, { id: "disputes.reason" }, { id: "disputes.buyer" }, { id: "disputes.amount" }, { id: "disputes.due" }, { id: "disputes.verdict" }, { id: "disputes.score" }, { id: "disputes.status" }] } },
      },
      widgetLayout: {
        kpis: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 8 },
        byReason: { xTrack: 0, yTrack: 8, xSpan: 10, ySpan: 13 },
        byVerdict: { xTrack: 10, yTrack: 8, xSpan: 7, ySpan: 13 },
        coverage: { xTrack: 17, yTrack: 8, xSpan: 7, ySpan: 13 },
        recovery: { xTrack: 0, yTrack: 21, xSpan: 24, ySpan: 13 },
        table: { xTrack: 0, yTrack: 34, xSpan: 24, ySpan: 16 },
      },
    },
    {
      id: "evidence",
      name: "Evidence gaps",
      widgets: {
        missing: { type: "bar-chart-stacked", format: title("What the record has, by requirement"), dataMapping: { categoryKey: [{ id: "evidence.requirement" }], valueKey: [{ id: "evidence.id", aggregation: "count" }], legendKey: [{ id: "evidence.status" }], tooltipKey: [] } },
        pivot: { type: "pivot-grid", format: title("Evidence results by reason"), dataMapping: { rows: [{ id: "disputes.reason" }], columns: [{ id: "evidence.status" }], values: [{ id: "evidence.id", aggregation: "count" }] } },
      },
      widgetLayout: {
        missing: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 18 },
        pivot: { xTrack: 0, yTrack: 18, xSpan: 24, ySpan: 14 },
      },
    },
    {
      id: "deadlines",
      name: "Deadlines",
      widgets: {
        radar: { type: "deadline-radar", format: title("Deadline radar"), dataMapping: { label: [{ id: "disputes.id" }], hours: [{ id: "disputes.hoursLeft", aggregation: "min" }], size: [{ id: "disputes.amount", aggregation: "sum" }], color: [{ id: "disputes.verdict", aggregation: "first" }] } },
        due: { type: "column-chart-stacked", format: title("Responses due by day"), dataMapping: { categoryKey: [{ id: "disputes.due" }], valueKey: [{ id: "disputes.amount", aggregation: "sum" }], legendKey: [{ id: "disputes.verdict" }], tooltipKey: [] } },
        urgent: { type: "grid", format: title("Open disputes, soonest first"), dataMapping: { cols: [{ id: "disputes.id" }, { id: "disputes.hoursLeft" }, { id: "disputes.reason" }, { id: "disputes.amount" }, { id: "disputes.verdict" }, { id: "disputes.status" }] }, sort: [{ field: { id: "disputes.hoursLeft" }, direction: "asc" }] },
      },
      widgetLayout: {
        radar: { xTrack: 0, yTrack: 0, xSpan: 11, ySpan: 18 },
        due: { xTrack: 11, yTrack: 0, xSpan: 13, ySpan: 18 },
        urgent: { xTrack: 0, yTrack: 18, xSpan: 24, ySpan: 16 },
      },
    },
  ],
  selectedPageId: "overview",
  // Open on the canvas and the AI panel; the build panels are one click away.
  panels: { filters: { collapsed: true }, edit: { collapsed: true }, data: { collapsed: true }, ai: { collapsed: false, width: 340 } },
} as unknown as AgReportState;

const palette = (colors: string[]) => Object.fromEntries(colors.flatMap((c, i) => [[`chartPaletteFills${i + 1}Color`, c], [`chartPaletteStrokes${i + 1}Color`, c]]));
const LIGHT_SERIES = ["#136f55", "#c07a1a", "#b03a35", "#4a5a8a", "#2f9c7a", "#8a6d3b", "#7a8a86", "#d4a24c"];
const DARK_SERIES = ["#52c99c", "#e8ad55", "#f2857b", "#9fb0e6", "#7fdcb8", "#c9a46a", "#a8b5b0", "#f0c674"];

const RADAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18 6"/><circle cx="8" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/></svg>`;

// Rebuttal's custom widget, registered alongside Studio's own and offered in the Compose menu.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WIDGETS = (config: any) =>
  createWidgets({
    additionalTypes: [
      {
        id: "deadline-radar",
        label: "Deadline radar",
        icon: RADAR_ICON,
        dataMapping: {
          label: { type: "field", supportedRoles: ["category"], requires: { cardinality: "many" }, required: true, aiDescription: "Identifier of each item, e.g. disputes.id." },
          hours: { type: "field", supportedRoles: ["numeric"], requires: { per: "dataMapping.label", cardinality: "one" }, required: true, aiDescription: "Hours until the deadline, e.g. disputes.hoursLeft." },
          size: { type: "field", supportedRoles: ["numeric"], requires: { per: "dataMapping.label", cardinality: "one" }, aiDescription: "Dot size, e.g. disputes.amount." },
          color: { type: "field", supportedRoles: ["category"], requires: { per: "dataMapping.label", cardinality: "one" }, aiDescription: "Dot colour by verdict, e.g. disputes.verdict." },
        },
        // The edit panel: Studio's standard title and format sections plus the four field slots.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        form: (params: any) =>
          params.createDefaults({
            dataMappingItems: [
              { key: "label", label: "Dispute" },
              { key: "hours", label: "Hours to deadline" },
              { key: "size", label: "Dot size" },
              { key: "color", label: "Dot colour" },
            ],
          }),
        comp: DeadlineRadar,
        defaultSize: { width: 600, height: 380 },
        minSize: { width: 320, height: 240 },
        ai: { description: "Radar of items by hours until their deadline: rings at 24 h, 48 h and 7 days, dots coloured by verdict and sized by amount. Map label=disputes.id, hours=disputes.hoursLeft, size=disputes.amount, color=disputes.verdict." },
      },
    ],
    menu: [...(config?.menu ?? []), { label: "Rebuttal", widgetIds: ["deadline-radar"] }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

const PROMPTS: AgAiPromptStarter[] = [
  { label: "Where am I losing money?", prompt: "Which reason codes put the most money at stake, and how much of it is the agent likely to recover? Add a widget that shows it." },
  { label: "Chart the evidence gaps", prompt: "Add a chart of the evidence requirements most often missing from the record, for open disputes only." },
  { label: "Explain my riskiest case", prompt: "Find the open dispute with the largest amount and a weak or concede verdict, look up its case file, and explain what evidence is missing." },
  { label: "This week's deadlines", prompt: "Add a widget listing open disputes due in the next 72 hours with their verdicts." },
];

const REBUTTAL_CONTEXT = `You work inside Rebuttal, an AI agent that defends merchants against PayPal disputes. The data is the merchant's dispute book: each dispute has a reason, an amount at stake, a response deadline, and the Rebuttal agent's verdict (strong, weak or concede) and evidence score; the evidence table has one row per evidence requirement checked. "Expected recovery" is the amount weighted by the evidence score for cases worth contesting. Never give legal advice.
Field values: disputes.open is "Open" or "Decided"; disputes.verdict is "strong", "weak", "concede" or "pending"; disputes.status is "needs_review", "approved", "conceded", "settled", "filed" or "processing"; evidence.status is "found", "partial", "missing", "contradicts" or "not needed".
Facts about a specific case come only from get_case_file. When relaying a delegate's findings, repeat its numbers and evidence statuses exactly as given; never add, round or rescale them (scores are 0 to 100).
Filtering: when a request is about a subset (for example open disputes), put the filter on the new widget only. Never add or change page filters unless the merchant explicitly asks to filter the whole page, so existing widgets keep showing all data.`;

const LEAD_ROUTING = `Routing rule: any question that names a dispute ID (like PP-D-100081 or PP-R-...), or asks why a dispute got its verdict, what evidence a case has or lacks, or what its drafted response says, must be delegated to the "disputes" agent (Dispute analyst). It is the only agent that can read case files; the data agent cannot. Dashboard building and aggregate questions go to the planning, data, page and widget agents as usual.`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const briefed = (def: any, extra = "") => ({ ...def, instructions: (...args: any[]) => `${typeof def.instructions === "function" ? def.instructions(...args) : def.instructions ?? ""}\n\n${REBUTTAL_CONTEXT}${extra ? `\n${extra}` : ""}` });

/** Rebuttal's own agent: reads case files and opens them in the queue, alongside Studio's built-in team. */
function disputesAgent(studio: AgStudioApi, mode: Mode) {
  const tools = studio.getAiTools();
  const getCase = studio.defineAiTool({
    name: "get_case_file",
    description: "Read Rebuttal's case file for one dispute: the buyer's claim, verdict, score, rationale, each evidence item and its status, gaps, and the drafted response.",
    params: (s) => s.object({ dispute_id: s.string({ description: "Dispute ID, e.g. PP-D-100081" }) }),
    execute: async (args, ctx) => {
      try {
        const d = await http.detail(mode, args.dispute_id.trim().toUpperCase());
        const c = d.caseFile;
        if (!c) return ctx.error("That dispute has no case file yet.");
        return ctx.success(`Case file for ${d.dispute.id}.`, {
          claim: d.dispute.buyerClaim,
          reason: d.dispute.reason,
          amount: `${d.dispute.amount.currency} ${d.dispute.amount.value}`,
          verdict: c.assessment.verdict,
          score: c.assessment.score,
          rationale: c.assessment.rationale,
          evidence: c.assessment.items.map((i) => ({ item: i.label, status: i.status, detail: i.detail })),
          gaps: c.draft.gaps,
          draft: (c.editedNotes ?? c.draft.notes).slice(0, 800),
          status: c.status,
        });
      } catch (e) {
        return ctx.error(`Couldn't read that case file: ${(e as Error).message}`);
      }
    },
  });
  const openCase = studio.defineAiTool({
    name: "open_case_in_queue",
    description: "Open a dispute's case file in Rebuttal's queue so the merchant can review and approve it.",
    params: (s) => s.object({ dispute_id: s.string({ description: "Dispute ID" }) }),
    execute: async (args, ctx) => {
      dispatchEvent(new CustomEvent("rb:open-case", { detail: args.dispute_id.trim().toUpperCase() }));
      return ctx.success(`Opened ${args.dispute_id} in the queue.`);
    },
  });
  return directLlmRunner({
    id: "disputes",
    name: "Dispute analyst",
    description: "Reads Rebuttal case files for specific disputes: why a verdict was given, which evidence was found or missing, and what the drafted response says. Can open a case in the queue for the merchant.",
    adapter,
    schema: (s) => s.undefined(),
    instructions: () =>
      `${REBUTTAL_CONTEXT}\nYou are the dispute analyst. Use view_schema and execute_query to find disputes, get_case_file to read one, and open_case_in_queue when the merchant should act on it. Quote only what the case file says. When you finish, your completion summary must state verbatim: the verdict, the score out of 100, the rationale, and every evidence item with its status (found, partial, missing, contradicts or not needed), plus the gaps. Be concise and add nothing that isn't in the case file.`,
    tools: () => [tools.viewSchema(), tools.executeQuery(), getCase, openCase],
  });
}

const PAGES = [
  { id: "overview", key: "studio.pOverview" },
  { id: "evidence", key: "studio.pEvidence" },
  { id: "deadlines", key: "studio.pDeadlines" },
] as const;

export default function Analytics({ mode }: { mode: Mode }) {
  const { t } = useI18n();
  const [studioApi, setStudioApi] = useState<AgStudioApi | null>(null);
  const [page, setPage] = useState<string>("overview");
  const goPage = (id: string) => {
    setPage(id);
    if (studioApi) studioApi.setState({ ...studioApi.getState(), selectedPageId: id });
  };
  const { resolved } = useTheme();
  const [tables, setTables] = useState<Tables | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    fetch(`/api/workspace/analytics${mode === "sandbox" ? "?mode=sandbox" : ""}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(t("error.load")))))
      .then((d: Tables) => live && setTables(d), (e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [mode, nonce, t]);

  // Studio switches colour modes from an attribute; mirror the app's theme onto it.
  useEffect(() => {
    document.documentElement.dataset.agThemeMode = `rb-${resolved}`;
  }, [resolved]);

  const theme = useMemo(
    () =>
      studioTheme
        .withParams(
          { backgroundColor: "#ffffff", foregroundColor: "#191c1b", accentColor: "#136f55", borderColor: "#e2ded5", fontFamily: { googleFont: "IBM Plex Sans" }, browserColorScheme: "light", ...palette(LIGHT_SERIES) },
          "rb-light"
        )
        .withParams(
          { backgroundColor: "#151a19", foregroundColor: "#e8edea", accentColor: "#52c99c", borderColor: "#26302d", fontFamily: { googleFont: "IBM Plex Sans" }, browserColorScheme: "dark", ...palette(DARK_SERIES) },
          "rb-dark"
        ),
    []
  );

  const data = useMemo(() => (tables ? sources(tables) : undefined), [tables]);

  const ai = useMemo<AgAiHarnessSetup>(
    () =>
      ({ api: core }) => {
        const api = core as unknown as AgStudioApi;
        return createAiHarness(api, ({ builtIn, tools }) => {
          // Studio's five agents on our model, with the lead briefed on Rebuttal and able to hand
          // dispute questions to our own analyst.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lead = builtIn.lead as any;
          const others = (Object.keys(builtIn) as (keyof typeof builtIn)[]).filter((k) => k !== "lead");
          return {
            agents: [
              directLlmRunner({
                ...briefed(lead, LEAD_ROUTING),
                adapter,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                tools: (...args: any[]) => [...((typeof lead.tools === "function" ? lead.tools(...args) : []) as { name: string }[]).filter((x) => x.name !== "delegate_to"), tools.delegateTo([...others, "disputes"])],
              }),
              ...others.map((k) => directLlmRunner({ ...briefed(builtIn[k]), adapter } as Parameters<typeof directLlmRunner>[0])),
              disputesAgent(api, mode),
            ],
            primary: "lead",
            promptStarters: PROMPTS,
          };
        });
      },
    [mode]
  );

  return (
    <section className="analytics card rise" aria-label={t("studio.title")}>
      <header className="analytics-head">
        <div>
          <span className="eyebrow">{t("studio.eyebrow")}</span>
          <h2>{t("studio.title")}</h2>
          <p className="muted small">{t("studio.body")}</p>
        </div>
        <div className="analytics-pages" role="tablist" aria-label={t("studio.title")}>
          {PAGES.map((p) => (
            <button key={p.id} role="tab" aria-selected={page === p.id} onClick={() => goPage(p.id)} disabled={!studioApi}>
              {t(p.key)}
            </button>
          ))}
        </div>
        <div className="analytics-actions">
          <button className="btn btn-ai" onClick={() => document.querySelector<HTMLTextAreaElement>(".analytics-body textarea")?.focus()}>
            <IconSpark />
            {t("studio.ask")}
          </button>
          <button className="btn btn-ghost" onClick={() => setNonce((n) => n + 1)} aria-label={t("studio.refresh")}>
            <IconRefresh />
          </button>
        </div>
      </header>
      <div className="analytics-body">
        {error ? (
          <div className="state-panel" role="alert">
            <p>{error}</p>
            <button className="btn btn-primary" onClick={() => setNonce((n) => n + 1)}>
              {t("error.retry")}
            </button>
          </div>
        ) : !data ? (
          <div className="analytics-skel" aria-busy="true">
            <span className="skel" style={{ height: 70 }} />
            <div>
              <span className="skel" />
              <span className="skel" />
              <span className="skel" />
            </div>
            <span className="skel" style={{ height: 220 }} />
          </div>
        ) : (
          <AgStudioProvider modules={MODULES} licenseKey={LICENSE}>
            <AgStudio key={`${mode}-${nonce}`} className="studio" style={{ height: "100%", width: "100%" }} data={data} mode="edit" theme={theme} initialState={REPORT} ai={ai} widgets={WIDGETS} onApiReady={(e) => setStudioApi(e.api as unknown as AgStudioApi)} />
          </AgStudioProvider>
        )}
      </div>
    </section>
  );
}
