import type { ReasonCode } from "./types";

export interface Requirement {
  key: string;
  label: string;
  why: string;
  weight: number;
  critical?: boolean;
}

export interface ReasonPlaybook {
  code: ReasonCode;
  short: string;
  label: string;
  question: string;
  physical: Requirement[];
  digital?: Requirement[];
}

const buyerContact: Requirement = {
  key: "buyer_contact",
  label: "Buyer messages on record",
  why: "What the buyer said before the dispute often confirms receipt or shows the claim changed.",
  weight: 1,
};

export const PLAYBOOK: Record<ReasonCode, ReasonPlaybook> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: {
    code: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    short: "Not received",
    label: "Item not received",
    question: "Can we prove the order reached the buyer?",
    physical: [
      { key: "tracking_number", label: "Carrier tracking number", why: "PayPal needs a trackable shipment to consider proof of fulfilment.", weight: 2 },
      { key: "delivery_confirmed", label: "Carrier shows delivered", why: "Delivery confirmation is the core answer to a not-received claim.", weight: 3, critical: true },
      { key: "address_match", label: "Delivered to the order address", why: "Delivery only counts if it went to the address the buyer gave.", weight: 2 },
      { key: "signature", label: "Signature on delivery", why: "Higher-value orders usually need a signature to win.", weight: 1 },
      buyerContact,
    ],
    digital: [
      { key: "digital_access", label: "Access or download after purchase", why: "For digital goods, an access log is the proof of delivery.", weight: 3, critical: true },
      { key: "access_ip_consistent", label: "Access from the buyer's usual network", why: "Shows the buyer, not someone else, received the goods.", weight: 1 },
      buyerContact,
    ],
  },
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: {
    code: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
    short: "Not as described",
    label: "Significantly not as described",
    question: "Did the buyer get what the listing promised?",
    physical: [
      { key: "listing_description", label: "Item description at time of sale", why: "Shows what the buyer was promised, in the merchant's own words.", weight: 2, critical: true },
      { key: "policy_disclosed", label: "Return policy shown at checkout", why: "A disclosed policy shows the buyer had a fair remedy.", weight: 2 },
      { key: "delivery_confirmed", label: "Carrier shows delivered", why: "Confirms the item that is being described actually arrived.", weight: 1 },
      { key: "return_offered", label: "Return or replacement offered", why: "Offering a fix before the dispute weighs heavily for the merchant.", weight: 2 },
      buyerContact,
    ],
  },
  UNAUTHORISED: {
    code: "UNAUTHORISED",
    short: "Unauthorised",
    label: "Unauthorised transaction",
    question: "Did the account holder really make this purchase?",
    physical: [
      { key: "avs_match", label: "Billing address check passed", why: "An address match suggests the cardholder entered the details.", weight: 2 },
      { key: "cvv_match", label: "Security code check passed", why: "A CVV match means the person had the physical card details.", weight: 2 },
      { key: "device_history", label: "Device seen on earlier orders", why: "The same device on undisputed orders points to the real buyer.", weight: 2 },
      { key: "prior_orders", label: "Earlier undisputed orders", why: "A history of accepted orders from this buyer undermines the claim.", weight: 2 },
      { key: "delivery_confirmed", label: "Delivered to the buyer's address", why: "Goods sent to the account holder's own address went to them.", weight: 1 },
    ],
  },
  DUPLICATE_TRANSACTION: {
    code: "DUPLICATE_TRANSACTION",
    short: "Duplicate",
    label: "Duplicate transaction",
    question: "Was the buyer really charged twice for one order?",
    physical: [
      { key: "distinct_orders", label: "Second charge is a separate order", why: "Different items or invoices prove both charges were wanted.", weight: 3, critical: true },
      { key: "refund_issued", label: "Refund already issued", why: "If the duplicate was already refunded, the dispute is moot.", weight: 2 },
    ],
  },
  CREDIT_NOT_PROCESSED: {
    code: "CREDIT_NOT_PROCESSED",
    short: "Credit not processed",
    label: "Credit not processed",
    question: "Was the buyer owed a refund, and did they get it?",
    physical: [
      { key: "refund_issued", label: "Refund already issued", why: "A recorded refund answers the claim directly.", weight: 3 },
      { key: "policy_disclosed", label: "Return policy shown at checkout", why: "The policy defines whether a credit was owed at all.", weight: 2 },
      { key: "return_window", label: "Return requested within the window", why: "A request outside the window means no credit was owed.", weight: 2, critical: true },
      buyerContact,
    ],
  },
  INCORRECT_AMOUNT: {
    code: "INCORRECT_AMOUNT",
    short: "Incorrect amount",
    label: "Incorrect amount charged",
    question: "Does the charge match what the buyer agreed to pay?",
    physical: [
      { key: "invoice_matches", label: "Charge matches the order total", why: "If line items add up to the charge, the amount was correct.", weight: 3, critical: true },
      { key: "checkout_total", label: "Total shown to the buyer at checkout", why: "Shows the buyer saw and accepted this exact total.", weight: 2 },
    ],
  },
  CANCELED_RECURRING_BILLING: {
    code: "CANCELED_RECURRING_BILLING",
    short: "Cancelled subscription",
    label: "Cancelled recurring billing",
    question: "Was the subscription still active when we charged?",
    physical: [
      { key: "no_prior_cancellation", label: "No cancellation before the charge", why: "A charge after cancellation is indefensible; one before it is not.", weight: 3, critical: true },
      { key: "terms_accepted", label: "Billing terms accepted", why: "Shows the buyer agreed to recurring charges.", weight: 2 },
      { key: "usage_after_charge", label: "Service used after the charge", why: "Continued use shows the buyer still valued the subscription.", weight: 2 },
    ],
  },
  PAYMENT_BY_OTHER_MEANS: {
    code: "PAYMENT_BY_OTHER_MEANS",
    short: "Paid another way",
    label: "Paid by other means",
    question: "Did the buyer really pay for this order twice, two ways?",
    physical: [
      { key: "single_payment", label: "Only one payment recorded for the order", why: "No second payment on record means the charge stands.", weight: 3, critical: true },
      buyerContact,
    ],
  },
};

export const REASON_CODES = Object.keys(PLAYBOOK) as ReasonCode[];
