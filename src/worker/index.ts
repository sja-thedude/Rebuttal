import type { Workspace } from "./workspace";

export { SandboxWorkspace, Workspace } from "./workspace";

export interface Env {
  WORKSPACE: DurableObjectNamespace<Workspace>;
  SANDBOX: DurableObjectNamespace<Workspace>;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
}

const COOKIE = "rb_ws";

function workspaceId(req: Request): { id: string; fresh: boolean } {
  const m = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)rb_ws=([a-f0-9-]{36})/);
  return m ? { id: m[1], fresh: false } : { id: crypto.randomUUID(), fresh: true };
}

const sse = (body: ReadableStream) =>
  new Response(body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });

const fail = (status: number, message: string) => Response.json({ error: message }, { status });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith("/api/")) return fail(404, "Not found");

    if (path === "/api/health") {
      return Response.json({ ok: true, paypal: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET), model: env.OPENROUTER_MODEL ?? null });
    }

    const ws = workspaceId(request);
    const sandbox = url.searchParams.get("mode") === "sandbox";
    if (sandbox && !(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET)) return fail(409, "The PayPal sandbox isn't connected on this deployment yet. The demo workspace is available.");
    const stub = sandbox ? env.SANDBOX.get(env.SANDBOX.idFromName("sandbox")) : env.WORKSPACE.get(env.WORKSPACE.idFromName(`demo:${ws.id}`));

    let res: Response;
    try {
      res = await route(request, path, stub);
    } catch (e) {
      res = fail(400, (e as Error).message.replace(/^Error: /, ""));
    }
    if (ws.fresh) {
      res = new Response(res.body, res);
      res.headers.append("Set-Cookie", `${COOKIE}=${ws.id}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`);
    }
    return res;
  },
} satisfies ExportedHandler<Env>;

async function route(req: Request, path: string, ws: DurableObjectStub<Workspace>): Promise<Response> {
  const m = req.method;
  const body = async <T>() => (await req.json().catch(() => ({}))) as T;

  if (m === "GET" && path === "/api/workspace") return Response.json(await ws.info());
  if (m === "POST" && path === "/api/workspace/reset") {
    await ws.reset();
    return Response.json(await ws.info());
  }
  if (m === "POST" && path === "/api/workspace/sync") return Response.json(await ws.sync());
  if (m === "POST" && path === "/api/disputes/fresh") return sse(await ws.fresh());
  if (m === "POST" && path === "/api/disputes/bulk") {
    const b = await body<{ ids?: string[]; action?: string }>();
    if (!Array.isArray(b.ids) || (b.action !== "approve" && b.action !== "concede")) return fail(400, "Choose disputes and an action.");
    return Response.json(await ws.bulk(b.ids.map(String), b.action));
  }

  const dm = path.match(/^\/api\/disputes\/([A-Za-z0-9-]+)(?:\/(run|draft|decision))?$/);
  if (dm) {
    const [, id, action] = dm;
    if (!action && m === "GET") {
      const d = await ws.detail(id);
      return d ? Response.json(d) : fail(404, "That dispute isn't in this workspace.");
    }
    if (action === "run" && m === "POST") return sse(await ws.run(id));
    if (action === "draft" && m === "PUT") {
      const b = await body<{ notes?: string }>();
      if (typeof b.notes !== "string" || !b.notes.trim()) return fail(400, "The response can't be empty.");
      return Response.json(await ws.saveDraft(id, b.notes));
    }
    if (action === "decision" && m === "POST") {
      const b = await body<{ action?: string }>();
      if (b.action !== "approve" && b.action !== "concede" && b.action !== "reopen") return fail(400, "Unknown decision.");
      return Response.json(await ws.decide(id, b.action));
    }
  }
  return fail(404, "Not found");
}
