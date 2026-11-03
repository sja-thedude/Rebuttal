import { TopBar } from "../components/TopBar";
import { Link } from "../router";
import { useI18n } from "../i18n";

export default function Landing() {
  const { t } = useI18n();
  return (
    <>
      <TopBar variant="landing" />
      <main id="main" className="view" style={{ maxWidth: 900, margin: "0 auto", padding: "80px 16px" }}>
        <h1 style={{ fontSize: "clamp(36px, 8vw, 64px)" }}>Rebuttal</h1>
        <p style={{ margin: "16px 0 28px", color: "var(--muted)", fontSize: 18 }}>
          Dispute defence for PayPal merchants. Evidence gathered, response drafted, honest score.
        </p>
        <Link to="/app" className="btn btn-primary btn-lg">
          {t("nav.open")}
        </Link>
      </main>
    </>
  );
}
