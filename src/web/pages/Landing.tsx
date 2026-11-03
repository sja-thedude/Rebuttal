import { useEffect } from "react";
import { PLAYBOOK, REASON_CODES } from "../../shared/playbook";
import { TopBar } from "../components/TopBar";
import { LogoMark } from "../components/Logo";
import { HeroBackdrop, SpotFind, SpotProof, SpotStep, SpotWrite } from "../components/Spots";
import { IconArrow, IconCheck, IconShield } from "../components/Icons";
import { ReasonGlyph } from "../console/cells";
import { useCountUp, useReveal } from "../hooks";
import { useI18n } from "../i18n";
import { useTheme } from "../theme";
import { Link } from "../router";
import { COPY } from "./copy";
import { HeroReplay } from "./HeroReplay";
import "./landing.css";

const REPO = "https://github.com/sja-thedude/Rebuttal";

function Stat({ n, suffix, label, i }: { n: number; suffix?: string; label: string; i: number }) {
  const v = useCountUp(n, 1400);
  return (
    <div className="stat reveal" style={{ ["--i" as string]: i }}>
      <span className="stat-n tnum">
        {Math.round(v)}
        {suffix}
      </span>
      <span className="stat-l">{label}</span>
    </div>
  );
}

export default function Landing() {
  const { lang, t, reason } = useI18n();
  const { resolved } = useTheme();
  const c = COPY[lang];
  const ref = useReveal<HTMLDivElement>();

  useEffect(() => {
    document.title = "Rebuttal — dispute defence for PayPal merchants";
  }, []);

  return (
    <div ref={ref}>
      <TopBar variant="landing" />
      <main id="main" className="landing view">
        <section className="hero">
          <HeroBackdrop />
          <div className="hero-copy">
            <span className="eyebrow-pill rise" style={{ ["--i" as string]: 0 }}>
              <LogoMark />
              {c.eyebrow}
            </span>
            <h1 className="rise" style={{ ["--i" as string]: 1 }}>
              {c.title1} <em>{c.title2}</em>
            </h1>
            <p className="hero-lede rise" style={{ ["--i" as string]: 2 }}>
              {c.lede}
            </p>
            <div className="hero-ctas rise" style={{ ["--i" as string]: 3 }}>
              <Link to="/app" className="btn btn-primary btn-lg">
                {c.ctaPrimary}
                <IconArrow className="flip-rtl" />
              </Link>
              <a href="#how" className="btn btn-lg">
                {c.ctaSecondary}
              </a>
            </div>
            <ul className="trust rise" style={{ ["--i" as string]: 4 }}>
              {c.trust.map((x) => (
                <li key={x}>
                  <IconCheck />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="hero-visual rise" style={{ ["--i" as string]: 3 }}>
            <HeroReplay />
            <span className="hero-caption">{c.heroLabel}</span>
          </div>
        </section>

        <section className="stats" aria-label="Rebuttal in numbers">
          {c.stats.map((s, i) => (
            <Stat key={i} i={i} n={s.n} suffix={"suffix" in s ? (s.suffix as string) : undefined} label={s.label} />
          ))}
        </section>

        <section className="section">
          <div className="section-head reveal">
            <span className="eyebrow">{c.problemEyebrow}</span>
            <h2>{c.problemTitle}</h2>
            <p>{c.problemBody}</p>
          </div>
          <div className="cards3">
            {c.problemCards.map((p, i) => (
              <article key={p.t} className="card lift feature reveal" style={{ ["--i" as string]: i }}>
                {[<SpotFind key="f" />, <SpotProof key="p" />, <SpotWrite key="w" />][i]}
                <h3>{p.t}</h3>
                <p>{p.b}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section" id="how">
          <div className="section-head reveal">
            <span className="eyebrow">{c.howEyebrow}</span>
            <h2>{c.howTitle}</h2>
            <p>{c.howBody}</p>
          </div>
          <ol className="steps">
            {c.steps.map((s, i) => (
              <li key={s.t} className="step card lift reveal" style={{ ["--i" as string]: i }}>
                <span className="step-n mono">0{i + 1}</span>
                <SpotStep n={i} />
                <h3>{s.t}</h3>
                <p>{s.b}</p>
                <code className="step-tool">{s.tool}</code>
              </li>
            ))}
          </ol>
        </section>

        <section className="section">
          <div className="section-head reveal">
            <span className="eyebrow">{c.reasonsEyebrow}</span>
            <h2>{c.reasonsTitle}</h2>
            <p>{c.reasonsBody}</p>
          </div>
          <div className="reasons">
            {REASON_CODES.map((code, i) => {
              const pb = PLAYBOOK[code];
              return (
                <article key={code} className="reason card lift reveal" style={{ ["--i" as string]: i % 4 }}>
                  <span className="reason-ico">
                    <ReasonGlyph code={code} />
                  </span>
                  <h3>{reason(code)}</h3>
                  <p className="reason-q" dir="auto">{pb.question}</p>
                  <ul dir="auto">
                    {pb.physical.slice(0, 3).map((r) => (
                      <li key={r.key}>{r.label}</li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>

        <section className="section honesty" id="honesty">
          <div className="honesty-grid">
            <div className="section-head reveal">
              <span className="eyebrow">{c.honestyEyebrow}</span>
              <h2>{c.honestyTitle}</h2>
              <p>{c.honestyBody}</p>
            </div>
            <div className="verdict-stack">
              {c.verdicts.map((v, i) => (
                <div key={v.v} className={`vcard card reveal vcard-${v.v}`} style={{ ["--i" as string]: i }}>
                  <span className={`pill pill-${v.v}`}>
                    <span className="dot" />
                    {v.t}
                  </span>
                  <p>{v.b}</p>
                  <span className="vbar" aria-hidden="true">
                    <span style={{ ["--w" as string]: v.v === "strong" ? 0.89 : v.v === "weak" ? 0.56 : 0.08 }} />
                  </span>
                </div>
              ))}
            </div>
          </div>
          <ul className="rules">
            {c.rules.map((r, i) => (
              <li key={r.t} className="reveal" style={{ ["--i" as string]: i }}>
                <IconShield />
                <div>
                  <h3>{r.t}</h3>
                  <p>{r.b}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="section shots">
          <div className="section-head reveal">
            <span className="eyebrow">{c.shotsEyebrow}</span>
            <h2>{c.shotsTitle}</h2>
            <p>{c.shotsBody}</p>
          </div>
          <div className="shot-frame reveal">
            <div className="shot-chrome" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <img src={`/shots/queue-${resolved}.jpg`} alt={c.shotAlt1} width={1440} height={900} loading="lazy" decoding="async" />
          </div>
          <div className="shot-frame shot-frame-2 reveal" style={{ ["--i" as string]: 1 }}>
            <img src={`/shots/case-${resolved}.jpg`} alt={c.shotAlt2} width={1440} height={900} loading="lazy" decoding="async" />
          </div>
        </section>

        <section className="cta-band reveal">
          <h2>{c.ctaTitle}</h2>
          <p>{c.ctaBody}</p>
          <Link to="/app" className="btn btn-primary btn-lg">
            {c.ctaPrimary}
            <IconArrow className="flip-rtl" />
          </Link>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="brand">
            <LogoMark />
            <span>Rebuttal</span>
          </div>
          <p>{c.footNote}</p>
          <p className="muted">
            {c.footBuilt}{" "}
            <a href={REPO} rel="noopener">
              {c.source}
            </a>
          </p>
          <nav className="footer-links" aria-label="Footer">
            <Link to="/app">{t("nav.console")}</Link>
            <a href="#how">{t("nav.how")}</a>
            <a href="#honesty">{t("nav.honesty")}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
