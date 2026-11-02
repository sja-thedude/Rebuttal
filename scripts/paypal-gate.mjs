// Day 1 gate: confirms sandbox credentials work and the Disputes API answers.
// Usage: put PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .dev.vars, then `npm run gate`.
import { readFileSync, existsSync } from "node:fs";

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
  headers: {
    Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
});
const token = await tokenRes.json();
if (!tokenRes.ok) {
  console.error("OAuth failed:", tokenRes.status, token);
  process.exit(1);
}
console.log("OAuth ok. App ID:", token.app_id);
const scopes = String(token.scope).split(" ");
console.log("Disputes scope present:", scopes.some((s) => s.includes("disputes")));

const auth = { Authorization: `Bearer ${token.access_token}` };

const disputes = await fetch(`${API}/v1/customer/disputes?page_size=50`, { headers: auth });
const disputesBody = await disputes.json();
console.log("\nGET /v1/customer/disputes ->", disputes.status, disputes.headers.get("paypal-debug-id"));
console.log(JSON.stringify(disputesBody, null, 2).slice(0, 2000));

const end = new Date();
const start = new Date(end.getTime() - 30 * 86400000);
const tx = await fetch(
  `${API}/v1/reporting/transactions?start_date=${start.toISOString().slice(0, 19)}Z&end_date=${end.toISOString().slice(0, 19)}Z&fields=all&page_size=5`,
  { headers: auth }
);
const txBody = await tx.json();
console.log("\nGET /v1/reporting/transactions ->", tx.status);
console.log(`transactions returned: ${txBody.transaction_details?.length ?? 0}`, txBody.message ?? "");
