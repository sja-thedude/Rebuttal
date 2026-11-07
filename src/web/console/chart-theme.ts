import type { AgChartTheme } from "ag-charts-community";

// Canvas charts can't read CSS variables, so the palettes mirror the tokens in styles.css.
const PALETTES = {
  light: { bg: "#ffffff", ink: "#191c1b", muted: "#646b67", line: "#e2ded5", accent: "#136f55", strong: "#136f55", weak: "#c07a1a", concede: "#b03a35" },
  dark: { bg: "#151a19", ink: "#e8edea", muted: "#94a19b", line: "#26302d", accent: "#52c99c", strong: "#5fd0a5", weak: "#e8ad55", concede: "#f2857b" },
};

export const verdictColor = (theme: "light" | "dark", v: string) => PALETTES[theme][v as "strong"] ?? PALETTES[theme].muted;

function theme(mode: "light" | "dark"): AgChartTheme {
  const p = PALETTES[mode];
  return {
    baseTheme: mode === "dark" ? "ag-default-dark" : "ag-default",
    palette: { fills: [p.accent, p.weak, p.concede], strokes: [p.accent, p.weak, p.concede] },
    params: {
      fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
      fontSize: 12,
      backgroundColor: p.bg,
      foregroundColor: p.ink,
      textColor: p.ink,
      subtleTextColor: p.muted,
      gridLineColor: p.line,
      axisLineColor: p.line,
      accentColor: p.accent,
      tooltipBackgroundColor: p.bg,
      tooltipTextColor: p.ink,
      chartPadding: 8,
    },
    overrides: {
      bar: { series: { cornerRadius: 6, strokeWidth: 0 } },
      donut: { series: { strokeWidth: 2, strokes: [p.bg] } },
    },
  };
}

export const CHART_THEMES = { "rb-light": theme("light"), "rb-dark": theme("dark") };
