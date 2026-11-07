import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n, type Key } from "../i18n";
import { useRouter } from "../router";
import { LogoMark } from "./Logo";
import { IconArrow, IconCheck, IconRefresh, IconSpark, IconX } from "./Icons";
import { api } from "../api";
import type { QueueRow, Verdict } from "../../shared/types";

interface Turn {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

const STORE = "rb-chat";
const ID = /(PP-[A-Z0-9]+(?:-[A-Z0-9]+)+)/g;
const IS_ID = /PP-[A-Z0-9]+(?:-[A-Z0-9]+)+/;
// The model proposes queue actions as filters ([[approve where verdict=strong; due_h<=48]]) or named
// disputes ([[concede: PP-D-1]]). The app resolves filters against the live queue; the merchant confirms.
const ACTION = /\[\[\s*(approve|concede)\b\s*(?::|where)?\s*([^\]]*)\]\]/gi;

const SUGGEST: Record<"landing" | "console", Key[]> = {
  landing: ["assistant.s.what", "assistant.s.invent", "assistant.s.paypal"],
  console: ["assistant.s.urgent", "assistant.s.act", "assistant.s.concede", "assistant.s.money"],
};

function load(): Turn[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? "[]") as Turn[];
  } catch {
    return [];
  }
}

/** Inline markdown: **bold**, `code` and dispute IDs, which become links into the console. */
function inline(text: string, onId: (id: string) => void): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).flatMap((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return [<strong key={i}>{inline(part.slice(2, -2), onId)}</strong>];
    if (part.startsWith("`") && part.endsWith("`")) {
      const inner = part.slice(1, -1);
      return [IS_ID.test(inner) ? <Fragment key={i}>{inline(inner, onId)}</Fragment> : <code key={i}>{inner}</code>];
    }
    return part.split(ID).map((seg, j) =>
      j % 2 ? (
        <button key={`${i}-${j}`} className="chat-id mono" onClick={() => onId(seg)}>
          {seg}
        </button>
      ) : (
        <Fragment key={`${i}-${j}`}>{seg}</Fragment>
      )
    );
  });
}

type Filter = { key: "verdict" | "due_h" | "amount" | "reason"; op: "=" | "<=" | ">="; value: string };
type Action = { kind: "approve" | "concede"; ids: string[]; filters: Filter[] };

function parseActions(text: string) {
  const actions: Action[] = [];
  const clean = text.replace(ACTION, (_, kind: string, body: string) => {
    const ids = [...new Set(body.toUpperCase().match(ID) ?? [])];
    const filters: Filter[] = [];
    if (!ids.length)
      for (const part of body.split(/[;,]|\band\b/i)) {
        const m = part.trim().match(/^(verdict|due_h|amount|reason)\s*(<=|>=|=|<|>)\s*(.+)$/i);
        if (m) filters.push({ key: m[1].toLowerCase() as Filter["key"], op: (m[2].startsWith("<") ? "<=" : m[2].startsWith(">") ? ">=" : "=") as Filter["op"], value: m[3].trim().replace(/^["']|["']$/g, "") });
      }
    if (ids.length || filters.length) actions.push({ kind: kind.toLowerCase() as Action["kind"], ids, filters });
    return "";
  });
  return { clean, actions };
}

function matches(r: QueueRow, f: Filter, label: string) {
  const n = parseFloat(f.value);
  if (f.key === "verdict") return r.verdict === f.value.toLowerCase();
  if (f.key === "reason") return `${label} ${r.reason}`.toLowerCase().includes(f.value.toLowerCase().replace(/_/g, " ")) || r.reason.toLowerCase().includes(f.value.toLowerCase());
  const v = f.key === "amount" ? r.amount : (Date.parse(r.responseDueAt) - Date.now()) / 36e5;
  return f.op === "<=" ? v <= n : f.op === ">=" ? v >= n : Math.round(v) === n;
}

/** A queue action the assistant proposed. Filters are applied to the live queue here, and nothing runs until Confirm. */
function ActionCard({ kind, ids, filters, onId }: Action & { onId: (id: string) => void }) {
  const { t, reason, verdict, money } = useI18n();
  const [state, setState] = useState<"loading" | "idle" | "working" | "done" | "error">("loading");
  const [targets, setTargets] = useState<QueueRow[]>([]);
  const [msg, setMsg] = useState("");
  const sandbox = new URLSearchParams(location.search).get("mode") === "sandbox";
  const mode = sandbox ? "sandbox" : "demo";

  useEffect(() => {
    let live = true;
    api.workspace(mode).then(
      (info) => {
        if (!live) return;
        const open = info.rows.filter((r) => r.status === "needs_review");
        setTargets(ids.length ? open.filter((r) => ids.includes(r.id)) : open.filter((r) => filters.every((f) => matches(r, f, reason(r.reason)))));
        setState("idle");
      },
      (e: Error) => live && (setMsg(e.message), setState("error"))
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    setState("working");
    try {
      const r = await api.bulk(mode, targets.map((x) => x.id), kind);
      setMsg(t("assistant.actionDone", { n: r.done.length }) + (r.failed.length ? ` · ${r.failed[0].message}` : ""));
      setState(r.done.length ? "done" : "error");
      dispatchEvent(new CustomEvent("rb:reload"));
    } catch (e) {
      setMsg((e as Error).message);
      setState("error");
    }
  };

  const chip = (f: Filter) =>
    f.key === "verdict" ? verdict(f.value.toLowerCase() as Verdict) : f.key === "due_h" ? t("assistant.fDue", { n: f.value }) : f.key === "amount" ? `${f.op === "<=" ? "≤" : f.op === ">=" ? "≥" : "="} ${money(parseFloat(f.value) || 0)}` : f.value;
  const total = targets.reduce((a, r) => a + r.amount, 0);

  return (
    <div className={`chat-action chat-action-${kind} is-${state}`}>
      <div className="chat-action-head">
        <span className="chat-action-ico">{kind === "approve" ? <IconCheck /> : <IconX />}</span>
        <strong>{state === "loading" ? t("assistant.actionFinding") : t(kind === "approve" ? "assistant.actionApprove" : "assistant.actionConcede", { n: targets.length })}</strong>
        {state !== "loading" && targets.length > 0 && <span className="mono small muted chat-action-total">{money(total)}</span>}
      </div>
      {filters.length > 0 && (
        <div className="chat-action-filters">
          {filters.map((f, k) => (
            <span key={k} className="chat-filter">{chip(f)}</span>
          ))}
        </div>
      )}
      {state === "loading" ? (
        <span className="skel" style={{ height: 26, borderRadius: 8 }} />
      ) : targets.length === 0 && state === "idle" ? (
        <p className="chat-action-result muted">{t("assistant.actionNone")}</p>
      ) : (
        <div className="chat-action-ids">
          {targets.slice(0, 12).map((r) => (
            <button key={r.id} className="chat-id mono" onClick={() => onId(r.id)} title={`${reason(r.reason)} · ${money(r.amount, r.currency)}`}>
              {r.id}
            </button>
          ))}
          {targets.length > 12 && <span className="small muted">+{targets.length - 12}</span>}
        </div>
      )}
      {state === "done" || state === "error" ? (
        <p className="chat-action-result">{msg}</p>
      ) : (
        targets.length > 0 && (
          <div className="chat-action-btns">
            <button className={`btn btn-sm ${kind === "approve" ? "btn-primary" : "btn-danger"}`} onClick={run} disabled={state !== "idle"}>
              {state === "working" ? t("assistant.actionWorking") : t("assistant.actionConfirm")}
            </button>
            <span className="small muted">{sandbox && kind === "approve" ? t("assistant.actionSandbox") : t("assistant.actionNote")}</span>
          </div>
        )
      )}
    </div>
  );
}

function Markdown({ text, onId }: { text: string; onId: (id: string) => void }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l)))
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""), onId)}</li>
              ))}
            </ul>
          );
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l.replace(/^#+\s*/, ""), onId)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

/**
 * The AI assistant, on every page. On the landing page it explains the product; in the console it
 * also sees the visitor's queue and any case they mention, and dispute IDs in its answers open
 * that case in the grid.
 */
export function Assistant() {
  const { t, lang, dir } = useI18n();
  const { path, go } = useRouter();
  const page = path.startsWith("/app") ? "console" : "landing";
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(load);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem("rb-chat-seen") === "1";
    } catch {
      return true;
    }
  });
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-20)));
    } catch {
      /* storage unavailable */
    }
  }, [turns]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: busy ? "auto" : "smooth" });
  }, [turns, busy, open]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const q = (e as CustomEvent<string | undefined>).detail;
      if (q) setTimeout(() => ask(q), 50);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("rb:assistant", onOpen);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("rb:assistant", onOpen);
      removeEventListener("keydown", onKey);
    };
  });

  useEffect(() => {
    if (!open) return;
    if (!seen) {
      setSeen(true);
      try {
        localStorage.setItem("rb-chat-seen", "1");
      } catch {
        /* storage unavailable */
      }
    }
    const id = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(id);
  }, [open, seen]);

  const openId = (id: string) => {
    if (page !== "console") go("/app");
    setTimeout(() => dispatchEvent(new CustomEvent("rb:open-case", { detail: id })), page === "console" ? 0 : 900);
    if (innerWidth < 640) setOpen(false);
  };

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const history = [...turns.filter((x) => !x.error), { role: "user" as const, content: question }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const mode = new URLSearchParams(location.search).get("mode") === "sandbox" ? "?mode=sandbox" : "";
    const put = (fn: (last: Turn) => Turn) => setTurns((ts) => [...ts.slice(0, -1), fn(ts[ts.length - 1])]);
    try {
      const res = await fetch(`/api/chat${page === "console" ? mode : ""}`, {
        method: "POST",
        signal: ctrl.signal,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), lang, page }),
      });
      if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? t("assistant.error"));
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, i).split("\n").find((l) => l.startsWith("data: "));
          buf = buf.slice(i + 2);
          if (!line) continue;
          const e = JSON.parse(line.slice(6)) as { t?: string; error?: string };
          if (e.t) put((last) => ({ ...last, content: last.content + e.t }));
          if (e.error) throw new Error(e.error);
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") put((last) => ({ role: "assistant", content: last.content || (e as Error).message || t("assistant.error"), error: !last.content }));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  const reset = () => {
    abort.current?.abort();
    setTurns([]);
    setBusy(false);
  };

  return (
    <>
      <button
        className={`chat-fab${open ? " hidden" : ""}${seen ? "" : " pulse"}`}
        onClick={() => setOpen(true)}
        aria-label={t("assistant.open")}
        aria-expanded={open}
        aria-controls="assistant"
      >
        <IconSpark />
        <span className="chat-fab-label">{t("assistant.open")}</span>
      </button>

      <section id="assistant" className={`chat${open ? " open" : ""}`} role="dialog" aria-modal="false" aria-label={t("assistant.title")} aria-hidden={!open} dir={dir}>
        <header className="chat-head">
          <span className="chat-avatar">
            <LogoMark />
            <span className="chat-online" />
          </span>
          <div className="chat-titles">
            <strong>{t("assistant.title")}</strong>
            <span>{page === "console" ? t("assistant.subConsole") : t("assistant.subLanding")}</span>
          </div>
          {turns.length > 0 && (
            <button className="chat-icon" onClick={reset} aria-label={t("assistant.new")} title={t("assistant.new")} tabIndex={open ? 0 : -1}>
              <IconRefresh />
            </button>
          )}
          <button className="chat-icon" onClick={() => setOpen(false)} aria-label={t("assistant.close")} tabIndex={open ? 0 : -1}>
            <IconX />
          </button>
        </header>

        <div className="chat-body" ref={listRef} aria-live="polite">
          <div className="chat-msg bot chat-welcome">
            <Markdown text={page === "console" ? t("assistant.welcomeConsole") : t("assistant.welcomeLanding")} onId={openId} />
          </div>
          {turns.length === 0 && (
            <div className="chat-suggest">
              {SUGGEST[page].map((k, i) => (
                <button key={k} onClick={() => ask(t(k))} style={{ ["--i" as string]: i }} tabIndex={open ? 0 : -1}>
                  {t(k)}
                </button>
              ))}
            </div>
          )}
          {turns.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role === "user" ? "me" : "bot"}${m.error ? " err" : ""}`} dir="auto">
              {m.role === "assistant" && !m.content ? (
                <span className="chat-typing" aria-label={t("assistant.thinking")}>
                  <i />
                  <i />
                  <i />
                </span>
              ) : m.role === "assistant" ? (
                (() => {
                  const streaming = busy && i === turns.length - 1;
                  const { clean, actions } = parseActions(m.content);
                  return (
                    <>
                      <Markdown text={streaming ? clean.replace(/\[\[[^\]]*$/, "") : clean} onId={openId} />
                      {streaming && <span className="caret" />}
                      {!streaming && page === "console" && actions.map((a, k) => <ActionCard key={k} {...a} onId={openId} />)}
                    </>
                  );
                })()
              ) : (
                m.content
              )}
            </div>
          ))}
        </div>

        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <label className="sr-only" htmlFor="chat-q">
            {t("assistant.placeholder")}
          </label>
          <textarea
            id="chat-q"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={1500}
            placeholder={t("assistant.placeholder")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(draft);
              }
            }}
            tabIndex={open ? 0 : -1}
          />
          <button type="submit" className="chat-send" disabled={busy || !draft.trim()} aria-label={t("assistant.send")} tabIndex={open ? 0 : -1}>
            <IconArrow className="flip-rtl" />
          </button>
        </form>
        <p className="chat-note">{t("assistant.note")}</p>
      </section>
    </>
  );
}
