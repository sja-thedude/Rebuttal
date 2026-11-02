import { PLAYBOOK } from "../shared/playbook";
import type { Assessment, Dispute, Draft, DraftEvidence, EvidenceItem, PayPalEvidenceType, Transaction } from "../shared/types";

const EVIDENCE_TYPE: Record<string, PayPalEvidenceType> = {
  tracking_number: "PROOF_OF_FULFILLMENT",
  delivery_confirmed: "PROOF_OF_FULFILLMENT",
  address_match: "PROOF_OF_FULFILLMENT",
  signature: "PROOF_OF_DELIVERY_SIGNATURE",
  digital_access: "PROOF_OF_FULFILLMENT",
  listing_description: "ITEM_DESCRIPTION",
  policy_disclosed: "RETURN_POLICY",
  return_window: "RETURN_POLICY",
  refund_issued: "PROOF_OF_REFUND",
  terms_accepted: "BILLING_AGREEMENT",
  no_prior_cancellation: "BILLING_AGREEMENT",
  invoice_matches: "PROOF_OF_RECEIPT_COPY",
  checkout_total: "PROOF_OF_RECEIPT_COPY",
};

export function evidenceTypeFor(key: string): PayPalEvidenceType {
  return EVIDENCE_TYPE[key] ?? "OTHER";
}

/** Groups found evidence into the `evidences[]` structure of PayPal's provide-evidence call. */
export function buildEvidences(items: EvidenceItem[], tx: Transaction | null, notesFor?: (type: PayPalEvidenceType, its: EvidenceItem[]) => string): DraftEvidence[] {
  const found = items.filter((i) => i.status === "found" || i.status === "partial");
  const groups = new Map<PayPalEvidenceType, EvidenceItem[]>();
  for (const i of found) {
    const t = evidenceTypeFor(i.key);
    groups.set(t, [...(groups.get(t) ?? []), i]);
  }
  return [...groups].map(([type, its]) => {
    const ev: DraftEvidence = { evidence_type: type, notes: notesFor ? notesFor(type, its) : its.map((i) => i.detail).join(" "), cites: its.map((i) => i.key) };
    if (type === "PROOF_OF_FULFILLMENT" && tx?.shipment?.trackingNumber)
      ev.evidence_info = { tracking_info: [{ carrier_name: "OTHER", carrier_name_other: tx.shipment.carrier, tracking_number: tx.shipment.trackingNumber }] };
    if (type === "PROOF_OF_REFUND" && tx?.refunds.length) ev.evidence_info = { refund_ids: tx.refunds.map((r) => r.id) };
    return ev;
  });
}

export function gapsFor(a: Assessment): string[] {
  return a.items.filter((i) => i.status === "missing" || i.status === "contradicts").map((i) => `${i.label}: ${i.detail}`);
}

/** Template draft built only from found evidence. Used when no model is configured. */
export function rulesDraft(d: Dispute, tx: Transaction | null, a: Assessment): Draft {
  const pb = PLAYBOOK[d.reason];
  const found = a.items.filter((i) => i.status === "found" || i.status === "partial");
  const lines: string[] = [];
  if (a.verdict === "concede") {
    lines.push(
      `Recommendation for the merchant: accept this claim. ${a.rationale}`,
      "",
      "No response has been drafted for PayPal, because the record doesn't support one."
    );
  } else {
    lines.push(
      `Dispute ${d.id} — ${pb.label.toLowerCase()}, ${d.amount.currency} ${d.amount.value.toFixed(2)}.`,
      "",
      `The buyer states: "${d.buyerClaim}"`,
      "",
      `Our records for invoice ${tx?.invoiceId ?? "(unknown)"} show the following:`,
      ...found.map((i) => `• ${i.detail}`),
      "",
      a.verdict === "strong"
        ? "Based on these records, we ask that the dispute be decided in the seller's favour."
        : "We ask that these records be considered in deciding the dispute."
    );
  }
  const notes = lines.join("\n");
  return { notes, evidences: a.verdict === "concede" ? [] : buildEvidences(a.items, tx), gaps: gapsFor(a), factCheck: factCheck(notes, d, tx, []) };
}

/**
 * Every amount, date and identifier in a draft must appear in the dispute or
 * transaction record. Anything that doesn't is reported as unverified.
 */
export function factCheck(notes: string, d: Dispute, tx: Transaction | null, history: Transaction[]): Draft["factCheck"] {
  const corpus = JSON.stringify([d, tx, history]).toLowerCase();
  const tokens = new Set<string>();
  for (const m of notes.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) tokens.add(m[0]);
  for (const m of notes.matchAll(/\b\d+\.\d{2}\b/g)) tokens.add(m[0]);
  for (const m of notes.matchAll(/\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{6,}\b/g)) tokens.add(m[0]);
  const unverified = [...tokens].filter((t) => {
    if (/^\d+\.\d{2}$/.test(t)) {
      const n = Number(t);
      return !corpus.includes(`:${n}`) && !corpus.includes(`:${t}`) && !corpus.includes(t);
    }
    return !corpus.includes(t.toLowerCase());
  });
  return { passed: unverified.length === 0, unverified };
}
