// Self-made illustrations. Colours come from theme tokens so they re-tint in dark mode.

export function IllusEmptyQueue({ className = "illus" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 170" role="img" aria-label="An empty stack of case folders under a magnifying glass">
      <ellipse cx="120" cy="152" rx="86" ry="9" fill="var(--bg-sunk)" />
      <rect x="44" y="52" width="128" height="86" rx="10" fill="var(--surface-2)" stroke="var(--line-strong)" strokeWidth="2" />
      <path d="M44 66a10 10 0 0 1 10-10h34l10 10h64a10 10 0 0 1 10 10" fill="none" stroke="var(--line-strong)" strokeWidth="2" />
      <rect x="58" y="34" width="112" height="78" rx="9" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" transform="rotate(-5 114 73)" />
      <g transform="rotate(-5 114 73)" stroke="var(--line)" strokeWidth="5" strokeLinecap="round">
        <path d="M74 56h52M74 70h76M74 84h40" />
      </g>
      <circle cx="168" cy="96" r="24" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="3" />
      <path d="m185 113 18 18" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" />
      <path d="M160 96h16" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function IllusError({ className = "illus" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 170" role="img" aria-label="A torn page with a warning mark">
      <ellipse cx="120" cy="152" rx="80" ry="9" fill="var(--bg-sunk)" />
      <path d="M62 30h88l28 28v84H62z" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
      <path d="M150 30v28h28" fill="var(--surface-2)" stroke="var(--line-strong)" strokeWidth="2" />
      <path d="M62 96l20-8 16 10 18-12 18 10 22-8 22 8" fill="none" stroke="var(--concede)" strokeWidth="2.5" strokeDasharray="5 5" />
      <path d="M80 56h50M80 70h70" stroke="var(--line)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="120" cy="122" r="13" fill="var(--concede-soft)" />
      <path d="M120 115v8M120 128v.01" stroke="var(--concede)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
