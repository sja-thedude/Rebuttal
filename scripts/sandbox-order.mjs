// Creates a real PayPal sandbox order with items, a shipping address and an invoice ID,
// waits for the sandbox buyer to approve it, captures it and adds a tracking number.
// The buyer can then open a dispute on it, which gives the sandbox workspace a real case.
// Usage: `npm run sandbox:order` (credentials from .dev.vars). Sandbox only.
import { readFileSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";

const API = "https://api-m.sandbox.paypal.com";

function loadVars() {
  const vars = { ...process.env };
  if (existsSync(".dev.vars")) {
    for (const line of readFileSync(".dev.vars", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m) vars[m[1]] ??= m[2];
    }
  }
  return vars;
}

const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret } = loadVars();
if (!id || !secret) {
  console.error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in .dev.vars");
  process.exit(1);
}

const tokenRes = await fetch(`${API}/v1/oauth2/token`, {
  method: "POST",
  headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
});
if (!tokenRes.ok) {
  console.error("OAuth failed:", tokenRes.status, await tokenRes.text());
  process.exit(1);
}
const { access_token } = await tokenRes.json();

async function pp(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", ...init.headers } });
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${body.message ?? ""} ${JSON.stringify(body.details ?? "")}`);
  return body;
}

const PRODUCTS = [
  { name: "Stoneware pour-over set", price: "68.00" },
  { name: "Hand-thrown serving bowl", price: "54.00" },
  { name: "Linen table runner", price: "39.00" },
  { name: "Speckled mug, pair", price: "42.00" },
];
const item = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
const qty = 1 + Math.floor(Math.random() * 2);
const total = (Number(item.price) * qty).toFixed(2);
const invoice = `KT-SBX-${Date.now().toString().slice(-6)}`;

const order = await pp("/v2/checkout/orders", {
  method: "POST",
  headers: { "PayPal-Request-Id": invoice },
  body: JSON.stringify({
    intent: "CAPTURE",
    purchase_units: [
      {
        invoice_id: invoice,
        description: `Kiln & Thread Studio order ${invoice}`,
        amount: { currency_code: "USD", value: total, breakdown: { item_total: { currency_code: "USD", value: total } } },
        items: [{ name: item.name, quantity: String(qty), unit_amount: { currency_code: "USD", value: item.price }, category: "PHYSICAL_GOODS" }],
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          shipping_preference: "GET_FROM_FILE",
          user_action: "PAY_NOW",
          brand_name: "Kiln & Thread Studio (sandbox)",
          return_url: "https://rebuttal.sjapathway.workers.dev/app?mode=sandbox",
          cancel_url: "https://rebuttal.sjapathway.workers.dev/app?mode=sandbox",
        },
      },
    },
  }),
});

const approve = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
console.log(`\nOrder ${order.id} created: ${qty}× ${item.name}, USD ${total}, invoice ${invoice}`);
console.log(`\n1. Open this link and log in with your sandbox PERSONAL (buyer) account, then click Pay:\n\n   ${approve}\n`);
if (process.platform === "darwin" && !process.env.NO_OPEN) execFile("open", [approve]);
console.log("Waiting for approval (up to 15 minutes)…");

const deadline = Date.now() + 15 * 60_000;
let status = order.status;
while (status !== "APPROVED" && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 4000));
  status = (await pp(`/v2/checkout/orders/${order.id}`)).status;
}
if (status !== "APPROVED") {
  console.error(`Order not approved in time (status ${status}). Run the script again to start over.`);
  process.exit(1);
}

const captured = await pp(`/v2/checkout/orders/${order.id}/capture`, { method: "POST", headers: { "PayPal-Request-Id": `${invoice}-cap` }, body: "{}" });
const capture = captured.purchase_units[0].payments.captures[0];
console.log(`Captured: transaction ${capture.id}, ${capture.status}`);

const tracking = `PW${Math.floor(1e9 + Math.random() * 9e9)}`;
try {
  await pp(`/v2/checkout/orders/${order.id}/track`, {
    method: "POST",
    body: JSON.stringify({ capture_id: capture.id, tracking_number: tracking, carrier: "OTHER", carrier_name_other: "Parcelway", notify_payer: false }),
  });
  console.log(`Tracking added: Parcelway ${tracking}`);
} catch (e) {
  console.log(`Tracking not added (${e.message}). The order is still valid for a dispute.`);
}

console.log(`
2. Now open the dispute as the buyer:
   - Go to https://www.sandbox.paypal.com/myaccount/summary (same buyer login)
   - Open the USD ${total} payment to Kiln & Thread Studio
   - Click "Report a problem", pick a reason (for example "I didn't receive it"), and submit
3. In Rebuttal, switch to the PayPal sandbox workspace and click "Sync from PayPal".
`);
