export interface Env {
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        paypal: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
        model: Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL),
      });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
