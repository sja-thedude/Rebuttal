import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { QueueRow } from "../../shared/types";
import { LANGS, useI18n } from "../i18n";
import { useTheme } from "../theme";
import { useRouter } from "../router";
import { IconArrow, IconChart, IconDownload, IconFile, IconGlobe, IconMoon, IconPlay, IconSearch, IconSun } from "../components/Icons";
import { VERDICT_CLASS } from "./cells";

interface Item {
  id: string;
  group: "actions" | "disputes";
  label: string;
  hint?: ReactNode;
  icon: ReactNode;
  keywords: string;
  run: () => void;
}

export interface PaletteProps {
  rows: QueueRow[];
  onClose: () => void;
  onOpenCase: (id: string) => void;
  onLive?: () => void;
  onExport: () => void;
  onInsights: () => void;
}

export function Palette({ rows, onClose, onOpenCase, onLive, onExport, onInsights }: PaletteProps) {
  const { t, reason, verdict, money, lang, setLang } = useI18n();
  const { resolved, setPref } = useTheme();
  const { go } = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.activeElement as HTMLElement | null;
    return () => prev?.focus?.();
  }, []);

  const items = useMemo<Item[]>(() => {
    const other = resolved === "dark" ? "light" : "dark";
    const actions: Item[] = [
      ...(onLive ? [{ id: "live", group: "actions" as const, label: t("toolbar.live"), icon: <IconPlay />, keywords: "live run agent new process", run: onLive }] : []),
      { id: "insights", group: "actions", label: t("palette.insights"), icon: <IconChart />, keywords: "insights charts analytics", run: onInsights },
      { id: "export", group: "actions", label: t("toolbar.export"), icon: <IconDownload />, keywords: "export csv download", run: onExport },
      { id: "theme", group: "actions", label: t("palette.theme", { mode: t(`palette.${other}`) }), icon: other === "dark" ? <IconMoon /> : <IconSun />, keywords: "theme dark light mode", run: () => setPref(other) },
      ...LANGS.filter((l) => l.code !== lang).map((l) => ({ id: `lang-${l.code}`, group: "actions" as const, label: t("palette.lang", { name: l.name }), icon: <IconGlobe />, keywords: `language ${l.code} ${l.name}`, run: () => setLang(l.code) })),
      { id: "home", group: "actions", label: t("palette.home"), icon: <IconArrow className="flip-rtl" />, keywords: "home landing", run: () => go("/") },
    ];
    const disputes: Item[] = rows.map((r) => ({
      id: r.id,
      group: "disputes",
      label: `${r.id} · ${r.buyerName}`,
      hint: (
        <>
          <span className="mono tnum">{money(r.amount, r.currency)}</span>
          {r.verdict && <span className={`pill pill-sm ${VERDICT_CLASS[r.verdict]}`}>{verdict(r.verdict)}</span>}
        </>
      ),
      icon: <IconFile />,
      keywords: `${r.id} ${r.buyerName} ${r.buyerEmail} ${reason(r.reason)} ${r.verdict ? verdict(r.verdict) : ""}`,
      run: () => onOpenCase(r.id),
    }));
    return [...actions, ...disputes];
  }, [rows, t, reason, verdict, money, lang, resolved, onLive, onExport, onInsights, onOpenCase, setLang, setPref, go]);

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (i: Item) => terms.every((w) => `${i.label} ${i.keywords}`.toLowerCase().includes(w));
    const actions = items.filter((i) => i.group === "actions" && hit(i));
    const disputes = items.filter((i) => i.group === "disputes" && hit(i)).slice(0, terms.length ? 12 : 6);
    return [...actions, ...disputes];
  }, [items, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (i: Item | undefined) => {
    if (!i) return;
    onClose();
    i.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(shown.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(shown[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      e.preventDefault();
    }
  };

  let lastGroup = "";
  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("palette.open")} onKeyDown={onKey}>
        <label className="palette-input">
          <IconSearch />
          <span className="sr-only">{t("palette.placeholder")}</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("palette.placeholder")}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={shown[active] ? `pi-${shown[active].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </label>
        <ul className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {shown.length === 0 && (
            <li className="palette-empty">
              <IconSearch />
              {t("palette.empty")}
            </li>
          )}
          {shown.map((i, n) => {
            const head = i.group !== lastGroup ? t(`palette.${i.group}`) : null;
            lastGroup = i.group;
            return (
              <li key={i.id} role="presentation">
                {head && <span className="palette-group">{head}</span>}
                <div
                  id={`pi-${i.id}`}
                  role="option"
                  aria-selected={n === active}
                  data-i={n}
                  className="palette-item"
                  style={{ ["--n" as string]: Math.min(n, 10) }}
                  onMouseMove={() => n !== active && setActive(n)}
                  onClick={() => choose(i)}
                >
                  <span className="palette-ico">{i.icon}</span>
                  <span className="palette-label" dir="auto">{i.label}</span>
                  {i.hint && <span className="palette-hint">{i.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="palette-foot small">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t("palette.navigate")}</span>
          <span><kbd>↵</kbd> {t("palette.select")}</span>
        </div>
      </div>
    </div>
  );
}
