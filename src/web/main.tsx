import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider, useI18n } from "./i18n";
import { ThemeProvider } from "./theme";
import { Router, useRouter } from "./router";
import { ToastProvider } from "./components/Toasts";
import Landing from "./pages/Landing";
import { Assistant } from "./components/Assistant";
import "./styles.css";

const Console = lazy(() => import("./console/Console"));

function ConsoleFallback() {
  return (
    <div className="boot" aria-busy="true">
      <span className="skel" style={{ width: 220, height: 30 }} />
      <span className="skel" style={{ width: "100%", height: 120, borderRadius: 18 }} />
      <span className="skel" style={{ width: "100%", height: 420, borderRadius: 18 }} />
    </div>
  );
}

function App() {
  const { path } = useRouter();
  const { t } = useI18n();
  return (
    <>
      <a className="skip-link" href="#main">{t("skip")}</a>
      {path.startsWith("/app") ? (
        <Suspense fallback={<ConsoleFallback />}>
          <Console />
        </Suspense>
      ) : (
        <Landing />
      )}
      <Assistant />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <Router>
            <App />
          </Router>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>
);
