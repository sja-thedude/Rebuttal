import type { DraftEvidence } from "./types";

export const ACCEPT_NOTE = "Merchant accepted the claim.";

/** The `input` part of a provide-evidence request, exactly as it is sent to PayPal. */
export function evidenceInput(evidences: DraftEvidence[], notes: string) {
  return { evidences: evidences.map(({ cites: _c, ...e }) => ({ ...e, notes: (e.notes || notes).slice(0, 2000) })) };
}
