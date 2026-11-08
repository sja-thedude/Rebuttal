// Self-made spot illustrations for the landing page, drawn with theme tokens.

const S = { fill: "none", stroke: "var(--ink-2)", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 160 110" className="spot" role="img" aria-label={label}>
      <rect x="4" y="4" width="152" height="102" rx="16" fill="var(--surface-2)" />
      {children}
    </svg>
  );
}

export function SpotFind() {
  return (
    <Frame label="A receipt under a magnifying glass">
      <path d="M42 22h52v66l-6-4-7 4-7-4-7 4-7-4-7 4-6-4z" {...S} fill="var(--surface)" />
      <path d="M52 36h32M52 46h24M52 56h28" {...S} stroke="var(--line-strong)" />
      <circle cx="100" cy="64" r="16" {...S} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={3} />
      <path d="m112 76 14 14" {...S} stroke="var(--accent)" strokeWidth={5} />
    </Frame>
  );
}

export function SpotProof() {
  return (
    <Frame label="A checklist with some items ticked and one missing">
      <rect x="40" y="18" width="80" height="74" rx="10" {...S} fill="var(--surface)" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(0 ${i * 20})`}>
          <rect x="52" y="30" width="12" height="12" rx="3" fill={i < 2 ? "var(--accent)" : "var(--concede-soft)"} stroke={i < 2 ? "var(--accent)" : "var(--concede)"} strokeWidth={2} />
          {i < 2 ? <path d="m55 36 2.5 2.5L62 33" stroke="var(--accent-ink)" strokeWidth={2} fill="none" strokeLinecap="round" /> : <path d="M55 36h6" stroke="var(--concede)" strokeWidth={2} strokeLinecap="round" />}
          <path d={`M72 36h${i === 2 ? 26 : 36}`} {...S} stroke="var(--line-strong)" strokeWidth={4} />
        </g>
      ))}
    </Frame>
  );
}

export function SpotWrite() {
  return (
    <Frame label="A document with an approval stamp">
      <path d="M46 16h50l18 18v62H46z" {...S} fill="var(--surface)" />
      <path d="M96 16v18h18" {...S} />
      <path d="M58 44h40M58 54h44M58 64h30" {...S} stroke="var(--line-strong)" strokeWidth={4} />
      <g transform="rotate(-12 104 82)">
        <rect x="84" y="70" width="44" height="22" rx="5" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={2.5} />
        <path d="M94 81h24" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" />
      </g>
    </Frame>
  );
}

export function SpotStep({ n }: { n: number }) {
  const shapes = [
    // watch: inbox with clock
    <g key="w">
      <path d="M36 50l12-24h64l12 24v30H36z" {...S} fill="var(--surface)" />
      <path d="M36 50h26l6 10h24l6-10h26" {...S} />
      <circle cx="118" cy="30" r="14" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={2.5} />
      <path d="M118 22v8l5 4" stroke="var(--accent)" strokeWidth={2.5} fill="none" strokeLinecap="round" />
    </g>,
    // investigate: linked records
    <g key="i">
      <rect x="22" y="30" width="44" height="50" rx="8" {...S} fill="var(--surface)" />
      <rect x="94" y="30" width="44" height="50" rx="8" {...S} fill="var(--surface)" />
      <path d="M32 44h24M32 54h18M104 44h24M104 54h18" {...S} stroke="var(--line-strong)" strokeWidth={4} />
      <path d="M66 55h28" stroke="var(--accent)" strokeWidth={3} strokeDasharray="4 5" strokeLinecap="round" />
      <circle cx="80" cy="55" r="8" fill="var(--accent)" />
    </g>,
    // assess: gauge
    <g key="a">
      <path d="M38 78a42 42 0 0 1 84 0" fill="none" stroke="var(--bg-sunk)" strokeWidth={12} strokeLinecap="round" />
      <path d="M38 78a42 42 0 0 1 70-31" fill="none" stroke="var(--accent)" strokeWidth={12} strokeLinecap="round" />
      <path d="M80 78l18-24" stroke="var(--ink)" strokeWidth={3.5} strokeLinecap="round" />
      <circle cx="80" cy="78" r="6" fill="var(--ink)" />
    </g>,
    // draft: page with pen
    <g key="d">
      <rect x="40" y="18" width="62" height="76" rx="8" {...S} fill="var(--surface)" />
      <path d="M52 34h38M52 46h38M52 58h26" {...S} stroke="var(--line-strong)" strokeWidth={4} />
      <path d="M96 84l30-30 8 8-30 30-11 3z" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
    </g>,
  ];
  return (
    <svg viewBox="0 0 160 110" className="spot" role="img" aria-hidden="true">
      <rect x="4" y="4" width="152" height="102" rx="16" fill="var(--surface-2)" />
      {shapes[n]}
    </svg>
  );
}

export function HeroBackdrop() {
  return <div className="hero-backdrop" aria-hidden="true" />;
}
