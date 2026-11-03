# Rebuttal

**Live demo: [rebuttal.sjapathway.workers.dev](https://rebuttal.sjapathway.workers.dev)**

An agent that defends merchants against PayPal payment disputes. It reads each dispute's reason code, works out which evidence would answer it, pulls that evidence from the transaction record, drafts a seller response, and tells the merchant honestly whether the case is worth contesting. Nothing is filed without the merchant's approval.

> Work in progress for the PayPal AI Hackathon. This README is updated at the end of every feature branch.

## What's in it so far

- **Dispute queue** built on AG Grid: column groups, custom cells for deadline urgency, verdict and evidence score, set and number filters, quick search, grouping by reason or verdict, multi-select bulk approve or concede, CSV export, and master/detail rows that open the full case file.
- **Case file** per dispute: the evidence that reason code needs, marked found, partial, missing or working against you; the drafted response in PayPal's provide-evidence structure; a fact check; and the agent's step-by-step reasoning log.
- **Live agent runs**: open a fresh dispute and watch the agent call its tools step by step.
- **Demo workspace**: 40 seeded disputes for a fictional shop, clearly labelled as seeded. Nothing in it is PayPal data and nothing is sent to PayPal.
- English, Arabic (right to left), French and Spanish. Light and dark themes.

## Setup

```bash
git clone https://github.com/sja-thedude/Rebuttal.git
cd Rebuttal
npm install
cp .env.example .dev.vars   # fill in sandbox values
npm run gate                # one real call to the PayPal sandbox Disputes API
npm run agent               # run the agent over the seeded disputes in the terminal
npm run dev
```

## Environment variables

Names only. See `.env.example`.

- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`: PayPal **sandbox** REST app credentials
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`: model access through OpenRouter

## Licence

MIT. See [LICENSE](LICENSE).
