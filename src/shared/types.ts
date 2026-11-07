export type ReasonCode =
  | "MERCHANDISE_OR_SERVICE_NOT_RECEIVED"
  | "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"
  | "UNAUTHORISED"
  | "DUPLICATE_TRANSACTION"
  | "CREDIT_NOT_PROCESSED"
  | "INCORRECT_AMOUNT"
  | "CANCELED_RECURRING_BILLING"
  | "PAYMENT_BY_OTHER_MEANS";

export type DataOrigin = "seeded" | "paypal-sandbox";

export interface Money {
  value: number;
  currency: string;
}

export interface Party {
  name: string;
  email: string;
  payerId: string;
}

export interface Dispute {
  id: string;
  origin: DataOrigin;
  reason: ReasonCode;
  status: "WAITING_FOR_SELLER_RESPONSE" | "UNDER_REVIEW" | "RESOLVED" | "OPEN";
  stage: "INQUIRY" | "CHARGEBACK" | "PRE_ARBITRATION";
  amount: Money;
  createdAt: string;
  responseDueAt: string;
  buyerClaim: string;
  buyer: Party;
  transactionId: string;
}

export interface LineItem {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  description: string;
}

export interface Shipment {
  carrier: string;
  trackingNumber?: string;
  shippedAt?: string;
  deliveredAt?: string;
  status: "delivered" | "in_transit" | "returned_to_sender" | "label_created" | "not_shipped";
  deliveredTo?: string;
  signatureName?: string;
}

export interface Message {
  at: string;
  from: "buyer" | "merchant";
  text: string;
}

export interface Transaction {
  id: string;
  origin: DataOrigin;
  invoiceId: string;
  date: string;
  amount: Money;
  buyer: Party;
  items: LineItem[];
  fulfilment: "physical" | "digital" | "subscription";
  shippingAddress?: string;
  shipment?: Shipment;
  digitalAccess?: { firstAccessAt: string; accessCount: number; ip: string }[];
  refunds: { id: string; at: string; amount: number }[];
  messages: Message[];
  policy: { returnWindowDays: number; shownAtCheckout: boolean; text: string };
  risk?: { avs: "match" | "partial" | "no_match" | "unavailable"; cvv: "match" | "no_match" | "unavailable"; ipCountry: string; deviceId: string };
  subscription?: { plan: string; startedAt: string; cancelledAt?: string; termsAcceptedAt?: string; lastUsedAt?: string };
  returnRequest?: { requestedAt: string; receivedAt?: string };
  checkoutTotalShown?: number;
  note?: string;
}

export type EvidenceStatus = "found" | "partial" | "missing" | "contradicts" | "not_needed";

export interface EvidenceItem {
  key: string;
  label: string;
  why: string;
  weight: number;
  critical: boolean;
  status: EvidenceStatus;
  detail: string;
  source?: string;
  facts?: string[];
}

export type Verdict = "strong" | "weak" | "concede";

export interface Assessment {
  reason: ReasonCode;
  items: EvidenceItem[];
  score: number;
  verdict: Verdict;
  rationale: string;
}

export type PayPalEvidenceType =
  | "PROOF_OF_FULFILLMENT"
  | "PROOF_OF_REFUND"
  | "PROOF_OF_DELIVERY_SIGNATURE"
  | "PROOF_OF_RECEIPT_COPY"
  | "RETURN_POLICY"
  | "BILLING_AGREEMENT"
  | "ITEM_DESCRIPTION"
  | "OTHER";

export interface DraftEvidence {
  evidence_type: PayPalEvidenceType;
  evidence_info?: {
    tracking_info?: { carrier_name: "OTHER"; carrier_name_other: string; tracking_number: string }[];
    refund_ids?: string[];
  };
  notes: string;
  cites: string[];
}

export interface Draft {
  notes: string;
  evidences: DraftEvidence[];
  gaps: string[];
  factCheck: { passed: boolean; unverified: string[] };
}

export type StepKind = "plan" | "tool" | "reasoning" | "check" | "result" | "error";

export interface AgentStep {
  i: number;
  at: string;
  kind: StepKind;
  title: string;
  reasoning?: string;
  tool?: string;
  args?: Record<string, unknown>;
  output?: string;
  ms?: number;
}

export type CaseStatus = "needs_review" | "approved" | "conceded" | "settled" | "filed" | "processing";

export interface CaseFile {
  disputeId: string;
  status: CaseStatus;
  engine: { kind: "model" | "rules"; model?: string };
  assessment: Assessment;
  draft: Draft;
  editedNotes?: string;
  log: AgentStep[];
  processedAt: string;
  decidedAt?: string;
  filing?: { ok: boolean; message: string };
  offer?: { amount: number; currency: string; note: string };
}

export interface QueueRow {
  id: string;
  origin: DataOrigin;
  reason: ReasonCode;
  stage: Dispute["stage"];
  amount: number;
  currency: string;
  buyerName: string;
  buyerEmail: string;
  createdAt: string;
  responseDueAt: string;
  verdict?: Verdict;
  score?: number;
  found: number;
  needed: number;
  status: CaseStatus;
  engine?: "model" | "rules";
}

export interface WorkspaceInfo {
  mode: "demo" | "sandbox";
  merchant: string;
  model: string | null;
  sandboxAvailable: boolean;
  liveRunsLeft: number;
  rows: QueueRow[];
}

export interface CaseDetail {
  dispute: Dispute;
  transaction: Transaction | null;
  history: Transaction[];
  caseFile: CaseFile | null;
}

export type StreamEvent =
  | { type: "dispute"; row: QueueRow }
  | { type: "step"; step: AgentStep }
  | { type: "done"; row: QueueRow; caseFile: CaseFile }
  | { type: "error"; message: string };
