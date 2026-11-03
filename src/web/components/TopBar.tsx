import { LANGS, useI18n, type Lang } from "../i18n";
import { useTheme, type ThemePref } from "../theme";
import { useScrolled } from "../hooks";
import { Link } from "../router";
import { LogoMark } from "./Logo";
import { IconChevronDown, IconGlobe, IconMonitor, IconMoon, IconSun } from "./Icons";

const ORDER: ThemePref[] = ["system", "light", "dark"];

export function ThemeToggle() {
  const { pref, setPref } = useTheme();
  const { t } = useI18n();
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  const label = `${t("theme.label")}: ${t(`theme.${pref}`)}`;
  return (
    <button className="btn btn-ghost icon-btn theme-toggle" onClick={() => setPref(next)} aria-label={label} title={label}>
      {pref === "light" ? <IconSun /> : pref === "dark" ? <IconMoon /> : <IconMonitor />}
    </button>
  );
}

export function LangSelect() {
  const { lang, setLang, t } = useI18n();
  return (
    <label className="select-wrap" title={t("lang.label")}>
      <span className="sr-only">{t("lang.label")}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("lang.label")}>
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
      <IconChevronDown />
    </label>
  );
}

export function TopBar({ variant }: { variant: "landing" | "console" }) {
  const { t } = useI18n();
  const scrolled = useScrolled();
  return (
    <header className={`topbar${scrolled || variant === "console" ? " scrolled" : ""}`}>
      <div className="topbar-inner">
        <Link to="/" className="brand" aria-label="Rebuttal home">
          <LogoMark />
          <span>Rebuttal</span>
        </Link>
        <nav aria-label="Main">
          {variant === "landing" ? (
            <>
              <a href="#how">{t("nav.how")}</a>
              <a href="#honesty">{t("nav.honesty")}</a>
            </>
          ) : (
            <Link to="/">{t("nav.home")}</Link>
          )}
          <Link to="/app">{t("nav.console")}</Link>
        </nav>
        <span className="spacer" />
        <IconGlobe className="lang-globe" style={{ width: 18, height: 18, color: "var(--faint)" }} />
        <LangSelect />
        <ThemeToggle />
        {variant === "landing" && (
          <Link to="/app" className="btn btn-primary cta-desktop">
            {t("nav.open")}
          </Link>
        )}
      </div>
    </header>
  );
}
