# Rebuttal

**Live demo: [rebuttal.sjapathway.workers.dev](https://rebuttal.sjapathway.workers.dev)**

An agent that defends merchants against PayPal payment disputes. It reads each dispute's reason code, works out which evidence would answer it, pulls that evidence from the transaction record, drafts a seller response, and tells the merchant honestly whether the case is worth contesting. Nothing is filed without the merchant's approval.

> Work in progress for the PayPal AI Hackathon. This README is updated at the end of every feature branch.

## Setup

```bash
git clone https://github.com/sja-thedude/Rebuttal.git
cd Rebuttal
npm install
cp .env.example .dev.vars   # fill in sandbox values
npm run gate                # one real call to the PayPal sandbox Disputes API
npm run dev
```

## Environment variables

Names only. See `.env.example`.

- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`: PayPal **sandbox** REST app credentials
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`: model access through OpenRouter

## Licence

MIT. See [LICENSE](LICENSE).
