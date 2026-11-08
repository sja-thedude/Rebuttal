import { use, useMemo, useState } from "react";
import type { AgWidgetParams } from "ag-studio";
import { AgIncompleteDataMappingOverlay, AgNoDataOverlay } from "ag-studio-react";

/**
 * A custom AG Studio widget: open disputes on a radar, closest to the centre when their response
 * deadline is nearest. Rings mark 24 hours, 48 hours and a week; dots are coloured by verdict and
 * sized by amount. It reads through Studio's data engine, so page filters and cross-filters apply.
 */
const RINGS = [
  { h: 24, label: "24 h" },
  { h: 48, label: "48 h" },
  { h: 168, label: "7 d" },
];
const MAX_H = 240;
const R = 46;
const VERDICT: Record<string, string> = { strong: "var(--strong)", weak: "var(--weak)", concede: "var(--concede)" };

const radius = (h: number) => (h <= 0 ? 2 : 4 + Math.sqrt(Math.min(h, MAX_H) / MAX_H) * (R - 4));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Params = AgWidgetParams<any>;
type Field = { key: string; id: string };

export default function DeadlineRadar(params: Params) {
  const { widgetApi, dataMapping } = params;
  const fields = dataMapping as unknown as Record<"label" | "hours" | "size" | "color", Field[] | undefined>;
  const label = fields.label?.at(0);
  const hours = fields.hours?.at(0);
  const size = fields.size?.at(0);
  const color = fields.color?.at(0);
  if (!label || !hours) return <AgIncompleteDataMappingOverlay />;
  return <Radar widgetApi={widgetApi} label={label} hours={hours} size={size} color={color} />;
}

function Radar({ widgetApi, label, hours, size, color }: { widgetApi: Params["widgetApi"]; label: Field; hours: Field; size?: Field; color?: Field }) {
  const request = useMemo(() => ({ fields: [label, hours, size, color].filter(Boolean) as Field[] }), [label, hours, size, color]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = use(widgetApi.getData(request as any)) as { results: { rows: Record<string, unknown>[] } };
  const [hover, setHover] = useState<string | null>(null);
  const rows = response.results.rows.filter((r) => typeof r[hours.key] === "number" && (r[hours.key] as number) <= MAX_H);
  if (!rows.length) return <AgNoDataOverlay />;

  const maxSize = Math.max(1, ...rows.map((r) => Number(size ? r[size.key] : 1) || 1));
  const dots = rows.map((r, i) => {
    const h = r[hours.key] as number;
    const a = i * 2.39996 - Math.PI / 2; // golden angle keeps dots apart
    const rr = radius(h);
    const s = size ? Number(r[size.key]) || 0 : 1;
    return {
      id: String(r[label.key]),
      h,
      x: 50 + Math.cos(a) * rr,
      y: 50 + Math.sin(a) * rr,
      r: 1.2 + Math.sqrt(s / maxSize) * 3.2,
      fill: VERDICT[String(color ? r[color.key] : "")] ?? "var(--info)",
      amount: size ? widgetApi.formatFieldValue(size as never, r[size.key] as never) : "",
      verdict: color ? String(r[color.key]) : "",
    };
  });
  const urgent = dots.filter((d) => d.h <= 48).length;
  const focus = dots.find((d) => d.id === hover);

  return (
    <div className="radar">
      <svg viewBox="0 0 100 100" role="img" aria-label={`${dots.length} disputes, ${urgent} due within 48 hours`}>
        <defs>
          <radialGradient id="radar-glow">
            <stop offset="0%" stopColor="var(--concede)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--concede)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r={radius(48)} fill="url(#radar-glow)" />
        {RINGS.map((g) => (
          <g key={g.h}>
            <circle cx="50" cy="50" r={radius(g.h)} className="radar-ring" />
            <text x="50" y={50 - radius(g.h) - 0.8} className="radar-ring-label">{g.label}</text>
          </g>
        ))}
        <line x1="50" y1="4" x2="50" y2="96" className="radar-axis" />
        <line x1="4" y1="50" x2="96" y2="50" className="radar-axis" />
        <g className="radar-sweep">
          <path d={`M50 50 L50 4 A46 46 0 0 1 ${50 + 46 * Math.sin(0.6)} ${50 - 46 * Math.cos(0.6)} Z`} />
        </g>
        {dots.map((d, i) => (
          <circle
            key={d.id}
            cx={d.x}
            cy={d.y}
            r={hover === d.id ? d.r + 1 : d.r}
            fill={d.fill}
            className="radar-dot"
            style={{ animationDelay: `${i * 25}ms` }}
            onMouseEnter={() => setHover(d.id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => dispatchEvent(new CustomEvent("rb:open-case", { detail: d.id }))}
          >
            <title>{`${d.id} · ${d.h <= 0 ? "overdue" : `${d.h} h left`}${d.amount ? ` · ${d.amount}` : ""}${d.verdict ? ` · ${d.verdict}` : ""}`}</title>
          </circle>
        ))}
        <circle cx="50" cy="50" r="1.4" className="radar-core" />
      </svg>
      <div className="radar-side">
        <strong className="radar-big">{urgent}</strong>
        <span>due within 48 hours</span>
        {focus ? (
          <p className="radar-focus">
            <b>{focus.id}</b>
            <br />
            {focus.h <= 0 ? "Overdue" : `${focus.h} h left`}
            {focus.amount && <> · {focus.amount}</>}
            {focus.verdict && <> · {focus.verdict}</>}
          </p>
        ) : (
          <p className="radar-hint">Hover a dot for details, click to open the case.</p>
        )}
        <ul className="radar-legend">
          <li><i style={{ background: "var(--strong)" }} />strong</li>
          <li><i style={{ background: "var(--weak)" }} />weak</li>
          <li><i style={{ background: "var(--concede)" }} />concede</li>
        </ul>
      </div>
    </div>
  );
}
