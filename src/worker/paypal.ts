// PayPal REST client, sandbox only. The base URL is fixed so live credentials can never be used.
import type { Dispute, DraftEvidence, ReasonCode, Transaction } from "../shared/types";

const API = "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(public status: number, message: string, public debugId?: string | null) {
    super(message);
  }
}

let cached: { token: string; exp: number; key: string } | null = null;

export class PayPalClient {
  constructor(private id: string, private secret: string) {}

  private async token(): Promise<string> {
    const key = this.id;
    if (cached && cached.key === key && cached.exp > Date.now() + 60_000) return cached.token;
    const res = await fetch(`${API}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${this.id}:${this.secret}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const body = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !body.access_token) throw new PayPalError(res.status, body.error_description ?? "PayPal sign-in failed");
    cached = { token: body.access_token, exp: Date.now() + (body.expires_in ?? 300) * 1000, key };
    return body.access_token;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await this.token()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : {};
    if (!res.ok) throw new PayPalError(res.status, body.message ?? body.error_description ?? `PayPal returned ${res.status}`, res.headers.get("paypal-debug-id"));
    return body as T;
  }

  async listDisputes(): Promise<Dispute[]> {
    const body = await this.request<{ items?: PPDisputeSummary[] }>("/v1/customer/disputes?page_size=50");
    const out: Dispute[] = [];
    for (const s of body.items ?? []) {
      if (s.status === "RESOLVED") continue;
      out.push(await this.getDispute(s.dispute_id));
    }
    return out;
  }

  async getDispute(id: string): Promise<Dispute> {
    const d = await this.request<PPDispute>(`/v1/customer/disputes/${encodeURIComponent(id)}`);
    const t = d.disputed_transactions?.[0];
    return {
      id: d.dispute_id,
      origin: "paypal-sandbox",
      reason: (d.reason as ReasonCode) ?? "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
      status: (d.status as Dispute["status"]) ?? "OPEN",
      stage: (d.dispute_life_cycle_stage as Dispute["stage"]) ?? "INQUIRY",
      amount: { value: Number(d.dispute_amount?.value ?? 0), currency: d.dispute_amount?.currency_code ?? "USD" },
      createdAt: d.create_time,
      responseDueAt: d.seller_response_due_date ?? new Date(Date.parse(d.create_time) + 10 * 86400_000).toISOString(),
      buyerClaim: d.messages?.find((m) => m.posted_by === "BUYER")?.content ?? d.extensions?.buyer_contacted_channel ?? "No message from the buyer on the dispute.",
      buyer: { name: t?.buyer?.name ?? "Buyer", email: t?.buyer?.email ?? "", payerId: t?.buyer?.payer_id ?? "" },
      transactionId: t?.seller_transaction_id ?? t?.buyer_transaction_id ?? "",
    };
  }

  /** Looks up a transaction in the reporting API within 31 days either side of the dispute. */
  async getTransaction(id: string, around: string): Promise<Transaction | null> {
    const at = Date.parse(around);
    for (const [from, to] of [[at - 31 * 864e5, at], [at - 62 * 864e5, at - 31 * 864e5]]) {
      const rows = await this.search({ transaction_id: id }, from, Math.min(to, Date.now()));
      if (rows.length) return rows[0];
    }
    return null;
  }

  async searchByBuyer(email: string, around: string): Promise<Transaction[]> {
    const at = Math.min(Date.parse(around), Date.now());
    const rows = await this.search({}, at - 31 * 864e5, at);
    return rows.filter((r) => r.buyer.email.toLowerCase() === email.toLowerCase());
  }

  private async search(filter: Record<string, string>, from: number, to: number): Promise<Transaction[]> {
    const q = new URLSearchParams({ start_date: new Date(from).toISOString().slice(0, 19) + "Z", end_date: new Date(to).toISOString().slice(0, 19) + "Z", fields: "all", page_size: "100", ...filter });
    const body = await this.request<{ transaction_details?: PPTransaction[] }>(`/v1/reporting/transactions?${q}`);
    return (body.transaction_details ?? []).map(mapTransaction);
  }

  async provideEvidence(id: string, evidences: DraftEvidence[], notes: string) {
    const input = { evidences: evidences.map(({ cites: _c, ...e }) => ({ ...e, notes: (e.notes || notes).slice(0, 2000) })) };
    const form = new FormData();
    form.append("input", new Blob([JSON.stringify(input)], { type: "application/json" }));
    const res = await fetch(`${API}/v1/customer/disputes/${encodeURIComponent(id)}/provide-evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.token()}` },
      body: form,
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { message?: string };
      throw new PayPalError(res.status, b.message ?? `PayPal returned ${res.status}`, res.headers.get("paypal-debug-id"));
    }
  }

  async acceptClaim(id: string, note: string) {
    await this.request(`/v1/customer/disputes/${encodeURIComponent(id)}/accept-claim`, { method: "POST", body: JSON.stringify({ note: note.slice(0, 2000) }) });
  }
}

interface PPDisputeSummary { dispute_id: string; status: string }
interface PPDispute {
  dispute_id: string;
  create_time: string;
  reason: string;
  status: string;
  dispute_life_cycle_stage?: string;
  dispute_amount?: { value: string; currency_code: string };
  seller_response_due_date?: string;
  messages?: { posted_by: string; content: string }[];
  extensions?: { buyer_contacted_channel?: string };
  disputed_transactions?: { seller_transaction_id?: string; buyer_transaction_id?: string; buyer?: { name?: string; email?: string; payer_id?: string } }[];
}
interface PPTransaction {
  transaction_info: { transaction_id: string; invoice_id?: string; transaction_initiation_date: string; transaction_amount: { value: string; currency_code: string }; transaction_note?: string };
  payer_info?: { email_address?: string; account_id?: string; payer_name?: { alternate_full_name?: string; given_name?: string; surname?: string } };
  shipping_info?: { address?: { line1?: string; city?: string; country_code?: string } };
  cart_info?: { item_details?: { item_name?: string; item_code?: string; item_quantity?: string; item_unit_price?: { value: string }; item_description?: string }[] };
}

function mapTransaction(t: PPTransaction): Transaction {
  const ti = t.transaction_info;
  const name = t.payer_info?.payer_name?.alternate_full_name ?? [t.payer_info?.payer_name?.given_name, t.payer_info?.payer_name?.surname].filter(Boolean).join(" ");
  const a = t.shipping_info?.address;
  return {
    id: ti.transaction_id,
    origin: "paypal-sandbox",
    invoiceId: ti.invoice_id ?? ti.transaction_id,
    date: ti.transaction_initiation_date,
    amount: { value: Number(ti.transaction_amount.value), currency: ti.transaction_amount.currency_code },
    buyer: { name: name || "Buyer", email: t.payer_info?.email_address ?? "", payerId: t.payer_info?.account_id ?? "" },
    items: (t.cart_info?.item_details ?? []).map((i) => ({ name: i.item_name ?? "Item", sku: i.item_code ?? "", quantity: Number(i.item_quantity ?? 1), unitPrice: Number(i.item_unit_price?.value ?? 0), description: i.item_description ?? "" })),
    fulfilment: "physical",
    shippingAddress: a ? [a.line1, a.city, a.country_code].filter(Boolean).join(", ") : undefined,
    refunds: [],
    messages: [],
    policy: { returnWindowDays: 30, shownAtCheckout: false, text: "" },
    note: ti.transaction_note,
  };
}
