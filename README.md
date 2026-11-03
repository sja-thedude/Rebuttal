# Rebuttal

**Live demo: [rebuttal.sjapathway.workers.dev](https://rebuttal.sjapathway.workers.dev)**

An agent that defends merchants against PayPal payment disputes. It reads each dispute's reason code, works out which evidence would answer it, pulls that evidence from the transaction record, drafts the seller response in the structure PayPal accepts, and tells the merchant honestly whether the case is worth contesting. Nothing is filed without the merchant's approval.

No account is needed to try it: the console opens on a demo workspace of 40 seeded disputes.

![The Rebuttal dispute queue](public/shots/queue-light.jpg)

## The problem

A small merchant gets a dispute notification with a deadline, often only days away. To contest it they have to find the transaction, the delivery proof, the messages and the refund policy, then write a rebuttal in the format the payment processor accepts. Most merchants can't do that in time, so they lose by default and absorb the loss. Some of those disputes were winnable. Others were never worth fighting, and contesting them just wastes the merchant's time.

## What it does

1. **Watches the queue.** Lists open disputes and orders them by response deadline.
2. **Works out what has to be proven.** Every reason code has its own evidence playbook. An "item not received" dispute needs tracking, a delivery scan and an address match. An "unauthorised" dispute needs address and security-code checks, device history and earlier undisputed orders.
3. **Gathers evidence from the record.** Order details, amounts, dates, fulfilment and shipment data, buyer messages, refunds, policy, and the buyer's history with this merchant.
4. **Drafts the response** in PayPal's `provide-evidence` structure (`evidence_type`, `tracking_info`, `refund_ids`, notes under 2,000 characters), citing only evidence it found.
5. **Fact-checks the draft.** Every amount, date and identifier in the draft must appear in the dispute or transaction record. If one doesn't, the draft is rejected and the agent has to fix it.
6. **Scores the case**: strong, weak, or concede. When the merchant's own records work against them (the parcel was returned to sender, or the buyer cancelled before the charge), Rebuttal recommends accepting the claim and says why.
7. **Waits for the merchant.** They review, edit, approve or accept the claim. Bulk actions are available for several disputes at once.

### The agent loop

Rebuttal is a tool-calling loop, not a single prompt behind a form. The model plans, calls tools, reads the results and decides what to do next:

| Tool | What it returns |
| --- | --- |
| `list_disputes()` | Open disputes and deadlines |
| `get_dispute(id)` | Reason code, amount, stage, deadline, buyer's claim |
| `get_transaction(id)` | Items, amounts, fulfilment, shipment, messages, refunds, policy, risk checks |
| `search_transactions(buyer_email)` | The buyer's other transactions with this merchant |
| `assess_evidence(dispute_id)` | Each required item as found, partial, missing or contradicts, plus score and verdict |
| `draft_response(dispute_id, notes, cites)` | Accepts the draft only if every cited item was found and the fact check passes |

Every step is logged with its reasoning, arguments, output and timing, and shown in the case file's **Agent log** tab. If the model is unavailable or fails, the run finishes with the deterministic rules engine. The UI says which engine produced each case.

### The dispute queue (AG Grid)

- Column groups (Dispute, Money, Deadline, Agent assessment, Review)
- Custom cell renderers: deadline urgency with a countdown bar, verdict pills, score bar with evidence dots, status pills, a reason glyph, and a seeded/sandbox origin tag
- Master/detail rows that open the full case file: evidence, editable response, agent log, order record
- Set, number, text and date filters; quick search; status filter tabs
- Row grouping by reason or verdict, with counts and totals
- Multi-row selection with bulk approve and bulk concede
- CSV export, a status bar with row counts and aggregation, and AG Grid's own locale packs for Arabic, French and Spanish
- One theme built from the app's design tokens, so the grid re-tints with light and dark mode and mirrors for right-to-left

### Demo workspace

Each visitor gets their own workspace of 40 seeded disputes for a fictional shop, spread across eight reason codes and the strong, weak and concede outcomes. Every seeded record is labelled `seeded` in the UI. None of it is PayPal data, and approving a seeded response sends nothing anywhere. **Process a new dispute live** opens a fresh seeded dispute and streams the agent's steps as it works.

### PayPal sandbox workspace

When sandbox credentials are configured, a **PayPal sandbox** workspace appears next to the demo. It syncs real disputes from the sandbox Disputes API, looks up the underlying transactions in the Transaction Search API, and files approved responses with `provide-evidence` (or `accept-claim` for a concession). The client is hard-wired to `api-m.sandbox.paypal.com`, so live credentials can't be used.

## Guardrails

- **Never invents evidence.** Drafts are built from found evidence only, and the fact check rejects any value not in the record. Missing evidence is shown to the merchant, never implied to PayPal.
- **Never auto-files.** Every response waits for the merchant's approval.
- **Not legal advice.** Rebuttal organises the merchant's own records and says so in the product.
- **Sandbox only.** No live PayPal credentials anywhere.

## Setup

Requires Node 20 or later.

```bash
git clone https://github.com/sja-thedude/Rebuttal.git
cd Rebuttal
npm install
cp .env.example .dev.vars   # fill in sandbox values (all optional for the demo)
npm run dev                 # http://localhost:5173
```

Other scripts:

```bash
npm run agent               # run the agent over all seeded disputes in the terminal
npm run agent -- PP-D-100081  # full reasoning log and draft for one dispute
npm run gate                # one real call to the PayPal sandbox Disputes API
npm run build               # typecheck and build
npm run deploy              # build and deploy to Cloudflare Workers
```

The demo workspace works with no environment variables at all. Without a model key, live runs use the rules engine.

### Environment variables

Names only; see `.env.example`. Set production values with `wrangler secret put <NAME>`.

| Name | Purpose |
| --- | --- |
| `PAYPAL_CLIENT_ID` | PayPal **sandbox** REST app client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal **sandbox** REST app secret |
| `OPENROUTER_API_KEY` | Model access through OpenRouter |
| `OPENROUTER_MODEL` | OpenRouter model ID (set in `wrangler.jsonc` vars) |
| `VITE_AG_GRID_LICENSE_KEY` | Optional, build time: removes the AG Grid Enterprise evaluation watermark |

## Stack

- **Frontend:** React 19 and Vite, with hand-written CSS design tokens. Fraunces, IBM Plex Sans, IBM Plex Sans Arabic and IBM Plex Mono.
- **Data grid:** AG Grid 36 (Community and Enterprise modules: master/detail, row grouping, set filter, status bar, menus).
- **Backend:** Cloudflare Workers, with a Durable Object per demo workspace (SQLite-backed storage) and one shared sandbox workspace. Agent runs stream to the browser over server-sent events.
- **Languages and themes:** English, Arabic (right to left), French and Spanish. Light and dark themes that follow the system setting, with a toggle.

## Tools

| Tool | How it's used |
| --- | --- |
| **PayPal Disputes API** (sandbox) | List disputes, show dispute details, `provide-evidence`, `accept-claim` |
| **PayPal Transaction Search API** (sandbox) | Find the disputed transaction and the buyer's other transactions |
| **PayPal OAuth 2.0** (sandbox) | Client-credentials token for the calls above |
| **OpenRouter**, model `anthropic/claude-sonnet-5.5` | Drives the agent loop: plans, chooses tool calls, reasons over results, writes the response notes. The model is set by `OPENROUTER_MODEL`. |
| **AG Grid** | The dispute queue |
| **Cloudflare Workers and Durable Objects** | Hosting, API and per-workspace state |
| **Playwright** | Product screenshots and the Open Graph image (development only) |

## Screenshots

| Queue | Case file |
| --- | --- |
| ![Queue, light](public/shots/queue-light.jpg) | ![Case file, light](public/shots/case-light.jpg) |
| ![Queue, dark](public/shots/queue-dark.jpg) | ![Case file, dark](public/shots/case-dark.jpg) |

## Hackathon categories

Submitted to the PayPal AI Hackathon, targeting **Most Impactful**, **Best Use of PayPal + AI**, **Best Use of Agentic Commerce** and **Best Use of AG Grid**.

## Licence

MIT. See [LICENSE](LICENSE).
