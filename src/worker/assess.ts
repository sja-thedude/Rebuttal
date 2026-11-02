import { PLAYBOOK, type Requirement } from "../shared/playbook";
import type { Assessment, Dispute, EvidenceItem, EvidenceStatus, Transaction, Verdict } from "../shared/types";

const day = (s?: string) => (s ? s.slice(0, 10) : "");
const money = (n: number, c = "USD") => `${c} ${n.toFixed(2)}`;
const DAY_MS = 86400_000;

type Finding = { status: EvidenceStatus; detail: string; source?: string; facts?: string[] };

function evaluate(key: string, d: Dispute, tx: Transaction, history: Transaction[]): Finding {
  const s = tx.shipment;
  const lastBuyerMsg = [...tx.messages].reverse().find((m) => m.from === "buyer");
  const others = history.filter((h) => h.id !== tx.id);
  switch (key) {
    case "tracking_number":
      return s?.trackingNumber
        ? { status: "found", detail: `${s.carrier} tracking ${s.trackingNumber}, shipped ${day(s.shippedAt)}.`, source: "transaction.shipment.trackingNumber", facts: [s.trackingNumber, s.carrier, day(s.shippedAt)] }
        : { status: "missing", detail: s?.status === "not_shipped" ? "The order has no shipment recorded. It was never sent." : "No tracking number is recorded for this order." };
    case "delivery_confirmed":
      if (!s) return { status: "missing", detail: "No shipment record exists for this order." };
      if (s.status === "delivered") return { status: "found", detail: `${s.carrier} marked the parcel delivered on ${day(s.deliveredAt)}.`, source: "transaction.shipment.deliveredAt", facts: [day(s.deliveredAt), s.carrier] };
      if (s.status === "returned_to_sender") return { status: "contradicts", detail: `${s.carrier} shows the parcel was returned to sender. The buyer did not receive it.`, source: "transaction.shipment.status" };
      if (s.status === "not_shipped") return { status: "contradicts", detail: "The order was never shipped.", source: "transaction.shipment.status" };
      return { status: "missing", detail: `Tracking shows "${s.status.replace(/_/g, " ")}" with no delivery scan.` };
    case "address_match": {
      if (!s?.deliveredTo || !tx.shippingAddress) return { status: "missing", detail: "No delivery address recorded by the carrier." };
      return s.deliveredTo === tx.shippingAddress
        ? { status: "found", detail: `Delivered to ${s.deliveredTo}, the address on the order.`, source: "transaction.shipment.deliveredTo", facts: [s.deliveredTo] }
        : { status: "contradicts", detail: `Carrier delivered to "${s.deliveredTo}", which differs from the order address "${tx.shippingAddress}".`, source: "transaction.shipment.deliveredTo" };
    }
    case "signature":
      if (d.amount.value < 750) return { status: "not_needed", detail: `Not required below USD 750; this order is ${money(d.amount.value)}.` };
      return s?.signatureName
        ? { status: "found", detail: `Signed for by "${s.signatureName}".`, source: "transaction.shipment.signatureName", facts: [s.signatureName] }
        : { status: "missing", detail: `No signature recorded on a ${money(d.amount.value)} order. PayPal usually expects one at this value.` };
    case "buyer_contact": {
      if (!tx.messages.length) return { status: "missing", detail: "No messages with the buyer are on record." };
      const helpful = tx.messages.find((m) => m.from === "buyer" && /arrived|thanks|received|keep it|download/i.test(m.text));
      const merchantOffer = tx.messages.find((m) => m.from === "merchant" && /refund|return|label|swap|zip/i.test(m.text));
      if (helpful) return { status: "found", detail: `On ${day(helpful.at)} the buyer wrote: "${helpful.text}"`, source: "transaction.messages", facts: [helpful.text, day(helpful.at)] };
      if (merchantOffer) return { status: "partial", detail: `${tx.messages.length} message(s) on record; on ${day(merchantOffer.at)} the merchant wrote: "${merchantOffer.text}"`, source: "transaction.messages", facts: [merchantOffer.text, day(merchantOffer.at)] };
      return { status: "partial", detail: `${tx.messages.length} message(s) on record, none confirming receipt. Last from buyer: "${lastBuyerMsg?.text ?? ""}"`, source: "transaction.messages" };
    }
    case "digital_access": {
      const a = tx.digitalAccess?.[0];
      return a
        ? { status: "found", detail: `First accessed ${day(a.firstAccessAt)}, ${a.accessCount} sessions since, from IP ${a.ip}.`, source: "transaction.digitalAccess", facts: [day(a.firstAccessAt), String(a.accessCount), a.ip] }
        : { status: "missing", detail: "The access log shows the purchase was never opened or downloaded." };
    }
    case "access_ip_consistent": {
      const a = tx.digitalAccess?.[0];
      if (!a) return { status: "missing", detail: "No access to compare." };
      return { status: "partial", detail: `Accessed from ${a.ip}. No earlier sessions on record to compare against.`, source: "transaction.digitalAccess" };
    }
    case "listing_description": {
      const it = tx.items[0];
      return it.description
        ? { status: "found", detail: `Listing for "${it.name}" said: "${it.description}"`, source: "transaction.items[0].description", facts: [it.name, it.description] }
        : { status: "missing", detail: `No listing description was saved with "${it.name}", so we can't show what was promised.` };
    }
    case "policy_disclosed":
      return tx.policy.shownAtCheckout
        ? { status: "found", detail: `Return policy shown at checkout: "${tx.policy.text}"`, source: "transaction.policy", facts: [tx.policy.text, String(tx.policy.returnWindowDays)] }
        : { status: "missing", detail: "There's no record that the return policy was shown at checkout." };
    case "return_offered": {
      const offer = tx.messages.find((m) => m.from === "merchant" && /return|refund|swap|replace/i.test(m.text));
      const declined = tx.messages.find((m) => m.from === "buyer" && /keep it|no thanks/i.test(m.text));
      if (offer && declined) return { status: "found", detail: `Merchant offered a return on ${day(offer.at)}; the buyer declined on ${day(declined.at)}: "${declined.text}"`, source: "transaction.messages", facts: [offer.text, declined.text, day(offer.at), day(declined.at)] };
      if (offer) return { status: "found", detail: `Merchant offered a return or swap on ${day(offer.at)}: "${offer.text}"`, source: "transaction.messages", facts: [offer.text, day(offer.at)] };
      const complaint = tx.messages.find((m) => m.from === "buyer");
      return complaint
        ? { status: "contradicts", detail: `The buyer raised the problem on ${day(complaint.at)} ("${complaint.text}") and no fix was offered.`, source: "transaction.messages" }
        : { status: "missing", detail: "No return or replacement was offered before the dispute." };
    }
    case "avs_match":
      if (!tx.risk) return { status: "missing", detail: "No address check result on record." };
      return tx.risk.avs === "match"
        ? { status: "found", detail: "Address verification matched the billing address.", source: "transaction.risk.avs", facts: ["match"] }
        : tx.risk.avs === "partial"
          ? { status: "partial", detail: "Address verification was a partial match (postcode only).", source: "transaction.risk.avs" }
          : { status: "contradicts", detail: `Address verification returned "${tx.risk.avs.replace("_", " ")}".`, source: "transaction.risk.avs" };
    case "cvv_match":
      if (!tx.risk) return { status: "missing", detail: "No security code result on record." };
      return tx.risk.cvv === "match"
        ? { status: "found", detail: "Card security code matched.", source: "transaction.risk.cvv" }
        : { status: tx.risk.cvv === "no_match" ? "contradicts" : "missing", detail: `Card security code check: ${tx.risk.cvv.replace("_", " ")}.`, source: "transaction.risk.cvv" };
    case "device_history": {
      if (!tx.risk) return { status: "missing", detail: "No device data on record." };
      const same = others.filter((h) => h.risk?.deviceId === tx.risk!.deviceId);
      if (same.length) return { status: "found", detail: `Device ${tx.risk.deviceId} placed ${same.length} earlier undisputed order(s): ${same.map((h) => h.invoiceId).join(", ")}.`, source: "search_transactions", facts: [tx.risk.deviceId, ...same.map((h) => h.invoiceId)] };
      if (tx.risk.ipCountry !== (tx.shippingAddress?.slice(-2) ?? tx.risk.ipCountry)) return { status: "contradicts", detail: `First time this device was seen, and the order came from an IP in ${tx.risk.ipCountry}, a different country from the delivery address.`, source: "transaction.risk" };
      return { status: "missing", detail: `Device ${tx.risk.deviceId} hasn't been seen on any earlier order.` };
    }
    case "prior_orders": {
      const ok = others.filter((h) => new Date(h.date) < new Date(tx.date));
      return ok.length
        ? { status: "found", detail: `${ok.length} earlier undisputed order(s) from ${tx.buyer.email}: ${ok.map((h) => `${h.invoiceId} (${day(h.date)})`).join(", ")}.`, source: "search_transactions", facts: ok.flatMap((h) => [h.invoiceId, day(h.date)]) }
        : { status: "missing", detail: `This is the first order from ${tx.buyer.email}.` };
    }
    case "distinct_orders": {
      const near = others.filter((h) => Math.abs(new Date(h.date).getTime() - new Date(tx.date).getTime()) < 7 * DAY_MS && h.amount.value === tx.amount.value);
      if (!near.length) return { status: "found", detail: `No other charge for ${money(tx.amount.value)} from this buyer within 7 days. Only one charge exists.`, source: "search_transactions" };
      const o = near[0];
      const sameItems = o.items.map((i) => i.sku).join() === tx.items.map((i) => i.sku).join();
      if (!sameItems || o.invoiceId !== tx.invoiceId)
        return { status: "found", detail: `The other charge (${o.invoiceId}, ${day(o.date)}) was a separate order for ${o.items.map((i) => i.name).join(", ")}, with its own shipment.`, source: "search_transactions", facts: [o.invoiceId, tx.invoiceId, day(o.date), ...o.items.map((i) => i.name)] };
      const mins = Math.round(Math.abs(new Date(o.date).getTime() - new Date(tx.date).getTime()) / 60000);
      return { status: "contradicts", detail: `A second charge for the same invoice ${o.invoiceId} and the same items went through ${mins} minute(s) apart. This looks like a genuine duplicate.`, source: "search_transactions" };
    }
    case "refund_issued": {
      const rf = tx.refunds[0];
      return rf
        ? { status: "found", detail: `Refund ${rf.id} for ${money(rf.amount)} was issued on ${day(rf.at)}.`, source: "transaction.refunds", facts: [rf.id, rf.amount.toFixed(2), day(rf.at)] }
        : { status: "missing", detail: "No refund has been issued on this transaction." };
    }
    case "return_window": {
      const rq = tx.returnRequest;
      const delivered = tx.shipment?.deliveredAt;
      if (!rq || !delivered) return { status: "missing", detail: "No return request is on record." };
      const days = Math.round((new Date(rq.requestedAt).getTime() - new Date(delivered).getTime()) / DAY_MS);
      if (days > tx.policy.returnWindowDays)
        return { status: "found", detail: `The return was requested ${days} days after delivery, outside the ${tx.policy.returnWindowDays}-day window.`, source: "transaction.returnRequest", facts: [String(days), String(tx.policy.returnWindowDays), day(rq.requestedAt)] };
      return { status: "contradicts", detail: `The return was requested ${days} days after delivery, within the window${rq.receivedAt ? `, and the item was received back on ${day(rq.receivedAt)}` : ""}. A credit was owed.`, source: "transaction.returnRequest" };
    }
    case "invoice_matches": {
      const sum = Math.round(tx.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0) * 100) / 100;
      return sum === tx.amount.value
        ? { status: "found", detail: `Line items total ${money(sum)}, exactly the amount charged.`, source: "transaction.items", facts: [sum.toFixed(2), ...tx.items.map((i) => i.name)] }
        : { status: "contradicts", detail: `Line items total ${money(sum)} but ${money(tx.amount.value)} was charged, ${money(tx.amount.value - sum)} more.`, source: "transaction.items" };
    }
    case "checkout_total":
      if (tx.checkoutTotalShown == null) return { status: "missing", detail: "No checkout total is on record." };
      return tx.checkoutTotalShown === tx.amount.value
        ? { status: "found", detail: `The buyer was shown and confirmed ${money(tx.checkoutTotalShown)} at checkout.`, source: "transaction.checkoutTotalShown", facts: [tx.checkoutTotalShown.toFixed(2)] }
        : { status: "contradicts", detail: `Checkout showed ${money(tx.checkoutTotalShown)}, less than the ${money(tx.amount.value)} charged.`, source: "transaction.checkoutTotalShown" };
    case "no_prior_cancellation": {
      const sub = tx.subscription;
      if (!sub) return { status: "missing", detail: "No subscription record found." };
      if (sub.cancelledAt && new Date(sub.cancelledAt) < new Date(tx.date))
        return { status: "contradicts", detail: `The buyer cancelled on ${day(sub.cancelledAt)}, before this charge on ${day(tx.date)}.`, source: "transaction.subscription.cancelledAt" };
      return { status: "found", detail: `Subscription active since ${day(sub.startedAt)} with no cancellation before the ${day(tx.date)} charge.`, source: "transaction.subscription", facts: [day(sub.startedAt), day(tx.date)] };
    }
    case "terms_accepted":
      return tx.subscription?.termsAcceptedAt
        ? { status: "found", detail: `Recurring billing terms accepted on ${day(tx.subscription.termsAcceptedAt)}.`, source: "transaction.subscription.termsAcceptedAt", facts: [day(tx.subscription.termsAcceptedAt)] }
        : { status: "missing", detail: "No record that recurring billing terms were accepted." };
    case "usage_after_charge":
      return tx.subscription?.lastUsedAt && new Date(tx.subscription.lastUsedAt) > new Date(tx.date)
        ? { status: "found", detail: `The buyer used the service on ${day(tx.subscription.lastUsedAt)}, after the charge.`, source: "transaction.subscription.lastUsedAt", facts: [day(tx.subscription.lastUsedAt)] }
        : { status: "missing", detail: "No usage recorded after the charge date." };
    case "single_payment": {
      const second = others.find((h) => h.invoiceId === tx.invoiceId);
      return second
        ? { status: "contradicts", detail: `Invoice ${tx.invoiceId} also has a payment on ${day(second.date)}${second.note ? ` (${second.note.toLowerCase()})` : ""}. The buyer paid twice.`, source: "search_transactions" }
        : { status: "found", detail: `Invoice ${tx.invoiceId} has exactly one payment on record, this one.`, source: "search_transactions", facts: [tx.invoiceId] };
    }
  }
  return { status: "missing", detail: "No evaluator for this evidence." };
}

export function requirementsFor(d: Dispute, tx: Transaction | null): Requirement[] {
  const pb = PLAYBOOK[d.reason];
  return tx?.fulfilment === "digital" && pb.digital ? pb.digital : pb.physical;
}

export function assessEvidence(d: Dispute, tx: Transaction | null, history: Transaction[]): Assessment {
  const reqs = requirementsFor(d, tx);
  const items: EvidenceItem[] = reqs.map((q) => {
    const f: Finding = tx ? evaluate(q.key, d, tx, history) : { status: "missing", detail: "The underlying transaction could not be found." };
    return { key: q.key, label: q.label, why: q.why, weight: q.weight, critical: Boolean(q.critical), ...f };
  });

  // Special cases where one piece of evidence settles the matter.
  const refund = items.find((i) => i.key === "refund_issued");
  const settledByRefund = refund?.status === "found" && (d.reason === "CREDIT_NOT_PROCESSED" || d.reason === "DUPLICATE_TRANSACTION");
  if (settledByRefund) for (const i of items) if (i.key !== "refund_issued" && i.status !== "found") i.status = "not_needed";
  // A separate order, or a return outside the window, means no refund was ever owed.
  const noRefundOwed = items.some((i) => (i.key === "distinct_orders" || i.key === "return_window") && i.status === "found");
  if (!settledByRefund && noRefundOwed && refund?.status === "missing") {
    refund.status = "not_needed";
    refund.detail = "Not needed: no refund was owed.";
  }

  const counted = items.filter((i) => i.status !== "not_needed");
  const total = counted.reduce((a, i) => a + i.weight, 0) || 1;
  const got = counted.reduce((a, i) => a + i.weight * (i.status === "found" ? 1 : i.status === "partial" ? 0.5 : i.status === "contradicts" ? -0.75 : 0), 0);
  let score = Math.max(0, Math.min(100, Math.round((got / total) * 100)));

  const critMissing = counted.filter((i) => i.critical && i.status === "missing");
  const critAgainst = counted.filter((i) => i.critical && i.status === "contradicts");
  const against = counted.filter((i) => i.status === "contradicts");
  if (settledByRefund) score = Math.max(score, 92);
  if (critMissing.length) score = Math.min(score, 45);
  if (critAgainst.length) score = Math.min(score, 12);
  if (d.reason === "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED") score = Math.min(score, 82);

  let verdict: Verdict = score >= 70 ? "strong" : score >= 40 ? "weak" : "concede";
  let rationale: string;
  if (settledByRefund) rationale = `A refund was already issued. Respond with proof of refund and the case should close in your favour.`;
  else if (critAgainst.length) rationale = `Your own records work against you: ${critAgainst[0].detail} Contesting would likely fail. Accepting the claim saves time and protects your account standing.`;
  else if (critMissing.length) rationale = `The deciding evidence is missing: ${critMissing[0].label.toLowerCase()}. Without it the response rests on weaker points.`;
  else if (verdict === "strong") rationale = `The record answers the buyer's claim directly. ${counted.filter((i) => i.status === "found").length} of ${counted.length} pieces of evidence are on file${against.length ? `, though ${against.length} point(s) cut the other way` : ""}.`;
  else if (verdict === "weak") rationale = `Some evidence supports you, but gaps remain: ${counted.filter((i) => i.status !== "found").map((i) => i.label.toLowerCase()).join(", ")}.`;
  else rationale = `Too little evidence supports a response. Accepting the claim is likely the better use of your time.`;

  if (verdict === "weak" && d.amount.value < 25) {
    verdict = "concede";
    rationale += ` At ${money(d.amount.value)}, contesting a borderline case probably costs more time than it recovers.`;
  }
  return { reason: d.reason, items, score, verdict, rationale };
}
