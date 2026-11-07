import type { Verdict } from "./types";

/**
 * A settlement offer for cases that aren't worth a full fight. The evidence score stands in for the
 * chance of winning, so amount × (1 − score) is the merchant's expected loss if they contest; offering
 * about that much settles now for no more than fighting is likely to cost. Strong cases get no offer.
 */
export function suggestOffer(amount: number, score: number, verdict: Verdict): { value: number; share: number } | null {
  if (verdict === "strong" || amount <= 0) return null;
  const share = Math.min(0.9, Math.max(0.2, 1 - score / 100));
  const value = Math.max(1, Math.round(amount * share * 2) / 2);
  return { value: Math.min(value, amount), share };
}

export const offerNote = (value: string, currency: string) =>
  `We'd like to resolve this directly. We're offering a partial refund of ${currency} ${value} in full settlement of this dispute.`;
