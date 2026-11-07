import type { ReactNode } from "react";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

// Self-drawn glyphs, one per stage of the loop.
const GLYPHS: ReactNode[] = [
  <g {...S} key="0"><path d="M4 7h16v11H4z" /><path d="m4 7 8 6 8-6" /><circle cx="19" cy="6" r="3" fill="currentColor" stroke="none" /></g>,
  <g {...S} key="1"><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h6M9 16h4" /></g>,
  <g {...S} key="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M8 15h3M14 15h3" /></g>,
  <g {...S} key="3"><path d="M4 18a8 8 0 1 1 16 0" /><path d="m12 18 4-5" /><circle cx="12" cy="18" r="1.4" fill="currentColor" /></g>,
  <g {...S} key="4"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13 7 4 4" /><path d="m16 18 2 2 4-4" /></g>,
  <g {...S} key="5"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></g>,
];

/** The agent loop as a flowing diagram: stages light up in turn while packets travel between them. */
export function Pipeline({ stages }: { stages: { t: string; s: string }[] }) {
  return (
    <div className="pipe reveal">
      <div className="pipe-grid" aria-hidden="true" />
      <ol className="pipe-track">
        {stages.map((st, i) => (
          <li key={st.s} className="pipe-node" style={{ ["--i" as string]: i }}>
            <span className="pipe-ico">
              <svg viewBox="0 0 24 24" aria-hidden="true">{GLYPHS[i]}</svg>
              <span className="pipe-ring" />
            </span>
            <span className="pipe-text">
              <strong dir="auto">{st.t}</strong>
              <code>{st.s}</code>
            </span>
            {i < stages.length - 1 && (
              <span className="pipe-link" aria-hidden="true">
                <span className="pipe-packet" />
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Stacked case files with an approval stamp that drops in when the section scrolls into view. */
export function StampScene({ label }: { label: string }) {
  return (
    <div className="stamp-scene reveal" aria-hidden="true">
      <svg viewBox="0 0 320 220" className="stamp-files">
        <g className="file f3">
          <rect x="70" y="40" width="190" height="140" rx="10" />
        </g>
        <g className="file f2">
          <rect x="55" y="52" width="190" height="140" rx="10" />
        </g>
        <g className="file f1">
          <rect x="40" y="64" width="190" height="140" rx="10" />
          <path d="M40 74a10 10 0 0 1 10-10h50l10 12h120" className="file-tab" />
          <rect x="60" y="96" width="90" height="8" rx="4" className="file-line strong-line" />
          <rect x="60" y="114" width="140" height="6" rx="3" className="file-line" />
          <rect x="60" y="128" width="120" height="6" rx="3" className="file-line" />
          <rect x="60" y="142" width="132" height="6" rx="3" className="file-line" />
          <rect x="60" y="164" width="60" height="18" rx="9" className="file-pill" />
        </g>
      </svg>
      <div className="stamp">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{label}</span>
      </div>
    </div>
  );
}
