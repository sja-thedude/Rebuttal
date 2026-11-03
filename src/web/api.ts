import type { CaseDetail, CaseFile, StreamEvent, WorkspaceInfo } from "../shared/types";

export type Mode = "demo" | "sandbox";

export class ApiError extends Error {}

async function call<T>(mode: Mode, path: string, init?: RequestInit): Promise<T> {
  const url = `/api${path}${mode === "sandbox" ? (path.includes("?") ? "&" : "?") + "mode=sandbox" : ""}`;
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, credentials: "same-origin" });
  } catch {
    throw new ApiError("We couldn't reach Rebuttal. Check your connection and try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status}).`);
  return body as T;
}

export const api = {
  workspace: (m: Mode) => call<WorkspaceInfo>(m, "/workspace"),
  reset: (m: Mode) => call<WorkspaceInfo>(m, "/workspace/reset", { method: "POST" }),
  sync: (m: Mode) => call<{ added: number; total: number }>(m, "/workspace/sync", { method: "POST" }),
  detail: (m: Mode, id: string) => call<CaseDetail>(m, `/disputes/${id}`),
  saveDraft: (m: Mode, id: string, notes: string) => call<CaseFile>(m, `/disputes/${id}/draft`, { method: "PUT", body: JSON.stringify({ notes }) }),
  decide: (m: Mode, id: string, action: "approve" | "concede" | "reopen") => call<CaseFile>(m, `/disputes/${id}/decision`, { method: "POST", body: JSON.stringify({ action }) }),
  bulk: (m: Mode, ids: string[], action: "approve" | "concede") => call<{ done: string[]; failed: { id: string; message: string }[] }>(m, "/disputes/bulk", { method: "POST", body: JSON.stringify({ ids, action }) }),
};

/** Opens an agent run and calls onEvent for each server-sent event. */
export async function stream(mode: Mode, path: string, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) {
  const res = await fetch(`/api${path}${mode === "sandbox" ? "?mode=sandbox" : ""}`, { method: "POST", signal, credentials: "same-origin" });
  if (!res.ok || !res.body) {
    const b = await res.json().catch(() => ({}));
    throw new ApiError((b as { error?: string }).error ?? "The agent couldn't start.");
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)) as StreamEvent);
    }
  }
}
