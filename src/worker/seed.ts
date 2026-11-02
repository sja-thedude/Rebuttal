// Seeded demo workspace. Every record produced here is marked origin: "seeded"
// and the UI labels it as such. Nothing here is presented as PayPal data.
import type { Dispute, LineItem, Party, ReasonCode, Transaction } from "../shared/types";

export const MERCHANT = "Kiln & Thread Studio";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = ReturnType<typeof rng>;
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

const ALNUM = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const code = (r: Rand, n: number) => Array.from({ length: n }, () => ALNUM[Math.floor(r() * ALNUM.length)]).join("");
const iso = (ms: number) => new Date(ms).toISOString();

interface Product {
  name: string;
  sku: string;
  price: number;
  description: string;
  kind: Transaction["fulfilment"];
}

const PRODUCTS: Product[] = [
  { name: "Stoneware dinner set, 6 settings", sku: "KT-DS6", price: 148, kind: "physical", description: "Eighteen pieces in speckled oat glaze: six dinner plates (27 cm), six side plates (20 cm), six bowls (16 cm). Dishwasher safe. Slight variation in glaze is part of the handmade process." },
  { name: "Hand-thrown mug, speckled oat", sku: "KT-MUG", price: 32, kind: "physical", description: "350 ml wheel-thrown stoneware mug with an unglazed foot. Each mug is unique; sizes vary by up to 5%." },
  { name: "Linen table runner, 240 cm", sku: "KT-RUN", price: 46, kind: "physical", description: "Stonewashed European linen, 40 x 240 cm, in clay. Machine washable at 40°C." },
  { name: "Walnut serving board", sku: "KT-WAL", price: 78, kind: "physical", description: "Solid black walnut, 45 x 22 cm, finished with food-safe oil. Natural grain and colour vary." },
  { name: "Glazed planter, large", sku: "KT-PLL", price: 64, kind: "physical", description: "26 cm stoneware planter with drainage hole and matching saucer, in moss glaze." },
  { name: "Ceramic pour-over set", sku: "KT-POS", price: 89, kind: "physical", description: "Dripper, 600 ml carafe and two cups in matte charcoal. Uses standard #2 paper filters." },
  { name: "Wool throw, herringbone", sku: "KT-THR", price: 129, kind: "physical", description: "130 x 180 cm lambswool throw in ash herringbone. Dry clean only." },
  { name: "Porcelain bud vase, matte white", sku: "KT-VAS", price: 54, kind: "physical", description: "14 cm slip-cast porcelain vase with a matte exterior and glazed interior, watertight." },
  { name: "Studio lamp with ceramic base", sku: "KT-LMP", price: 212, kind: "physical", description: "Table lamp, 52 cm tall, hand-glazed ceramic base with a natural linen shade. E27 fitting, bulb not included." },
  { name: "Handmade dining centrepiece collection", sku: "KT-CEN", price: 860, kind: "physical", description: "Commissioned set of five stoneware vessels for a dining table, signed by the maker. Made to order over four weeks." },
  { name: "Glazing masterclass (video course)", sku: "KT-DGM", price: 59, kind: "digital", description: "Six hours of streamed video lessons with downloadable glaze recipes. Lifetime access from the account that purchased it." },
  { name: "Printable pattern pack, 40 designs", sku: "KT-DPP", price: 18, kind: "digital", description: "Forty high-resolution PDF patterns for surface decoration, delivered as an instant download." },
  { name: "Clay club monthly box", sku: "KT-SUB", price: 39, kind: "subscription", description: "Monthly delivery of 5 kg of clay, one glaze sample and a project card. Billed monthly until cancelled from the account page." },
];

const PEOPLE = [
  "Amara Okafor", "Lukas Brandt", "Priya Raman", "Mateo Silva", "Hannah Kowalski", "Yusuf Demir", "Chloe Martin",
  "Kenji Watanabe", "Sofia Rossi", "Daniel Mensah", "Leila Haddad", "Oliver Byrne", "Ines Moreau", "Tomasz Nowak",
  "Grace Liu", "Rafael Ortega", "Noor Al-Sayed", "Emily Carter", "Aarav Shah", "Freya Lindqvist", "Marcus Bell",
  "Zara Ahmed", "Hugo Lefevre", "Camila Reyes", "Sam Whitfield", "Mei Tanaka", "Jonas Weber", "Fatima Zahra",
  "Liam O'Connor", "Ana Costa", "Rohan Mehta", "Elif Yildiz",
];

const STREETS = ["Alder Row", "Quarry Lane", "Mill Street", "Harbour Road", "Linden Avenue", "Orchard Close", "Station Parade", "Kiln Yard"];
const CITIES: [string, string][] = [
  ["Bristol", "GB"], ["Leeds", "GB"], ["Dublin", "IE"], ["Rotterdam", "NL"], ["Lyon", "FR"], ["Austin", "US"], ["Portland", "US"],
  ["Toronto", "CA"], ["Melbourne", "AU"], ["Munich", "DE"], ["Valencia", "ES"],
];
const CARRIERS = ["Parcelway", "Northline Express", "Coastal Post"];

function person(r: Rand, name: string): Party & { address: string; country: string } {
  const [city, country] = pick(r, CITIES);
  const handle = name.toLowerCase().replace(/[^a-z ]/g, "").replace(" ", ".");
  return {
    name,
    email: `${handle}@${pick(r, ["example.com", "example.net", "example.org"])}`,
    payerId: code(r, 13),
    address: `${int(r, 2, 180)} ${pick(r, STREETS)}, ${city}, ${country}`,
    country,
  };
}

type Variant = "strong" | "strong_alt" | "weak" | "weak_alt" | "concede" | "concede_alt" | "digital_strong" | "digital_concede";

const PLAN: [ReasonCode, Variant][] = [
  ["MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "strong"],
  ["MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "strong"],
  ["MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "strong_alt"],
  ["MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "weak"],
  ["MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "weak_alt"],
  ["MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "concede"],
  ["MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "concede_alt"],
  ["MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "digital_strong"],
  ["MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "digital_concede"],
  ["MERCHANDISE_OR_SERVICE_NOT_RECEIVED", "strong"],
  ["MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", "strong"],
  ["MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", "strong"],
  ["MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", "weak"],
  ["MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", "weak"],
  ["MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", "concede"],
  ["MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", "weak_alt"],
  ["MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", "strong_alt"],
  ["UNAUTHORISED", "strong"],
  ["UNAUTHORISED", "strong"],
  ["UNAUTHORISED", "weak"],
  ["UNAUTHORISED", "weak"],
  ["UNAUTHORISED", "concede"],
  ["UNAUTHORISED", "concede"],
  ["DUPLICATE_TRANSACTION", "strong"],
  ["DUPLICATE_TRANSACTION", "strong_alt"],
  ["DUPLICATE_TRANSACTION", "concede"],
  ["DUPLICATE_TRANSACTION", "strong"],
  ["CREDIT_NOT_PROCESSED", "strong"],
  ["CREDIT_NOT_PROCESSED", "strong_alt"],
  ["CREDIT_NOT_PROCESSED", "concede"],
  ["CREDIT_NOT_PROCESSED", "weak"],
  ["CREDIT_NOT_PROCESSED", "strong_alt"],
  ["INCORRECT_AMOUNT", "strong"],
  ["INCORRECT_AMOUNT", "strong"],
  ["INCORRECT_AMOUNT", "concede"],
  ["CANCELED_RECURRING_BILLING", "strong"],
  ["CANCELED_RECURRING_BILLING", "concede"],
  ["CANCELED_RECURRING_BILLING", "weak"],
  ["PAYMENT_BY_OTHER_MEANS", "strong"],
  ["PAYMENT_BY_OTHER_MEANS", "concede"],
];

// Hours until the response is due, chosen so the queue shows a realistic spread of urgency.
const DUE_HOURS = [5, 11, 19, 26, 31, 40, 46, 52, 60, 70, 78, 90, 100, 115, 130, 150, 170, 190, 210, 230];

const CLAIMS: Record<ReasonCode, string[]> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: [
    "I never received this order. It has been weeks and nothing has arrived.",
    "The tracking says delivered but there was nothing at my door.",
    "Order never showed up and the seller hasn't helped.",
  ],
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: [
    "The colour is completely different from the photos and the size is smaller than listed.",
    "This arrived damaged and does not look like the listing at all.",
    "Quality is nothing like what was described. I want a full refund.",
  ],
  UNAUTHORISED: [
    "I did not make this purchase. Someone used my account.",
    "I don't recognise this transaction.",
  ],
  DUPLICATE_TRANSACTION: ["I was charged twice for the same order."],
  CREDIT_NOT_PROCESSED: [
    "I returned the item and was promised a refund that never came.",
    "Seller agreed to refund me but I have not received the money.",
  ],
  INCORRECT_AMOUNT: ["I was charged more than the price shown at checkout."],
  CANCELED_RECURRING_BILLING: ["I cancelled this subscription and was still charged."],
  PAYMENT_BY_OTHER_MEANS: ["I already paid for this order by bank transfer, so this charge is a second payment."],
};

export interface SeedData {
  disputes: Dispute[];
  transactions: Transaction[];
}

function productFor(r: Rand, reason: ReasonCode, variant: Variant): Product {
  const physical = PRODUCTS.filter((p) => p.kind === "physical" && p.sku !== "KT-CEN");
  if (variant === "digital_strong" || variant === "digital_concede") return pick(r, PRODUCTS.filter((p) => p.kind === "digital"));
  if (reason === "CANCELED_RECURRING_BILLING") return PRODUCTS.find((p) => p.kind === "subscription")!;
  if (reason === "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" && (variant === "strong_alt" || variant === "weak_alt"))
    return PRODUCTS.find((p) => p.sku === "KT-CEN")!;
  return pick(r, physical);
}

function buildCase(r: Rand, index: number, reason: ReasonCode, variant: Variant, now: number, buyerName: string, dueHours: number): SeedData {
  const buyer = person(r, buyerName);
  const product = productFor(r, reason, variant);
  const qty = product.kind === "physical" && product.price < 60 && r() > 0.5 ? 2 : 1;
  const items: LineItem[] = [{ name: product.name, sku: product.sku, quantity: qty, unitPrice: product.price, description: product.description }];
  const shippingFee = product.kind === "physical" ? pick(r, [0, 6.5, 9.95]) : 0;
  const total = Math.round((qty * product.price + shippingFee) * 100) / 100;

  const responseDueAt = now + dueHours * HOUR + int(r, 0, 50) * 60_000;
  const createdAt = responseDueAt - (reason === "UNAUTHORISED" ? 20 : 10) * DAY - int(r, 0, 3) * DAY;
  const txDate = createdAt - int(r, 12, 34) * DAY;
  const deviceId = `dev_${code(r, 6).toLowerCase()}`;
  const ip = `${int(r, 31, 212)}.${int(r, 1, 254)}.${int(r, 1, 254)}.${int(r, 1, 254)}`;

  const tx: Transaction = {
    id: code(r, 17),
    origin: "seeded",
    invoiceId: `KT-${10400 + index * 7 + int(r, 0, 6)}`,
    date: iso(txDate),
    amount: { value: total, currency: "USD" },
    buyer: { name: buyer.name, email: buyer.email, payerId: buyer.payerId },
    items,
    fulfilment: product.kind,
    shippingAddress: product.kind === "physical" ? buyer.address : undefined,
    refunds: [],
    messages: [],
    policy: {
      returnWindowDays: 30,
      shownAtCheckout: true,
      text: "Returns accepted within 30 days of delivery for unused items in original packaging. Made-to-order pieces are final sale.",
    },
    risk: { avs: "match", cvv: "match", ipCountry: buyer.country, deviceId },
    checkoutTotalShown: total,
  };
  if (shippingFee) items.push({ name: "Tracked shipping", sku: "SHIP", quantity: 1, unitPrice: shippingFee, description: "Tracked delivery" });

  const carrier = pick(r, CARRIERS);
  const shippedAt = txDate + int(r, 1, 3) * DAY;
  const delivered = (to = buyer.address, signature?: string) => {
    tx.shipment = { carrier, trackingNumber: `${carrier.slice(0, 2).toUpperCase()}${code(r, 10)}`, shippedAt: iso(shippedAt), deliveredAt: iso(shippedAt + int(r, 2, 5) * DAY), status: "delivered", deliveredTo: to, signatureName: signature };
  };

  const extra: Transaction[] = [];
  const priorOrders = (n: number, sameDevice: boolean) => {
    for (let k = 0; k < n; k++) {
      const p = pick(r, PRODUCTS.filter((x) => x.kind === "physical" && x.price < 150));
      const d = txDate - int(r, 30, 300) * DAY;
      extra.push({
        id: code(r, 17),
        origin: "seeded",
        invoiceId: `KT-${9000 + int(r, 0, 1300)}`,
        date: iso(d),
        amount: { value: p.price, currency: "USD" },
        buyer: tx.buyer,
        items: [{ name: p.name, sku: p.sku, quantity: 1, unitPrice: p.price, description: p.description }],
        fulfilment: "physical",
        shippingAddress: buyer.address,
        shipment: { carrier, trackingNumber: `${carrier.slice(0, 2).toUpperCase()}${code(r, 10)}`, shippedAt: iso(d + DAY), deliveredAt: iso(d + 4 * DAY), status: "delivered", deliveredTo: buyer.address },
        refunds: [],
        messages: [],
        policy: tx.policy,
        risk: { avs: "match", cvv: "match", ipCountry: buyer.country, deviceId: sameDevice ? deviceId : `dev_${code(r, 6).toLowerCase()}` },
      });
    }
  };
  const said = (from: "buyer" | "merchant", text: string, at: number) => tx.messages.push({ at: iso(at), from, text });

  switch (reason) {
    case "MERCHANDISE_OR_SERVICE_NOT_RECEIVED": {
      if (variant === "digital_strong") {
        tx.digitalAccess = [
          { firstAccessAt: iso(txDate + 20 * 60_000), accessCount: int(r, 6, 31), ip },
        ];
        said("buyer", "Is there a way to download the recipes as one file?", txDate + 2 * DAY);
        said("merchant", "Yes, there's a zip on the last lesson page.", txDate + 2 * DAY + 3 * HOUR);
      } else if (variant === "digital_concede") {
        tx.digitalAccess = [];
      } else if (variant === "strong") {
        delivered();
        if (r() > 0.4) said("buyer", "Box arrived, thanks! Lovely packaging.", Date.parse(tx.shipment!.deliveredAt!) + 5 * HOUR);
      } else if (variant === "strong_alt") {
        delivered(buyer.address, buyer.name.split(" ")[0][0] + ". " + buyer.name.split(" ")[1]);
      } else if (variant === "weak") {
        delivered(`${int(r, 2, 180)} ${pick(r, STREETS)}, ${pick(r, CITIES)[0]}`);
      } else if (variant === "weak_alt") {
        delivered();
      } else if (variant === "concede") {
        tx.shipment = { carrier, status: "not_shipped" };
        said("buyer", "Any update on my order? It's been two weeks.", txDate + 14 * DAY);
      } else {
        tx.shipment = { carrier, trackingNumber: `${carrier.slice(0, 2).toUpperCase()}${code(r, 10)}`, shippedAt: iso(shippedAt), status: "returned_to_sender" };
      }
      if (variant !== "digital_strong" && variant !== "digital_concede" && r() > 0.5) priorOrders(int(r, 1, 2), true);
      break;
    }
    case "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED": {
      delivered();
      const at = Date.parse(tx.shipment!.deliveredAt!);
      if (variant === "strong" || variant === "strong_alt") {
        said("buyer", "The glaze is darker than I expected.", at + DAY);
        said("merchant", "Sorry it isn't what you pictured. Happy to send a prepaid return label for a full refund, or swap it for a lighter piece.", at + DAY + 4 * HOUR);
        if (variant === "strong_alt") said("buyer", "No thanks, I'll keep it.", at + 2 * DAY);
      } else if (variant === "weak") {
        tx.policy.shownAtCheckout = false;
        said("buyer", "This is not what I ordered.", at + DAY);
      } else if (variant === "weak_alt") {
        tx.policy.shownAtCheckout = false;
      } else {
        tx.items[0].description = "";
        tx.policy.shownAtCheckout = false;
        said("buyer", "It arrived broken in three pieces, photos attached. Please help.", at + 3 * HOUR);
      }
      break;
    }
    case "UNAUTHORISED": {
      delivered();
      if (variant === "strong") {
        priorOrders(int(r, 2, 4), true);
      } else if (variant === "weak") {
        tx.risk = { avs: "partial", cvv: "match", ipCountry: buyer.country, deviceId };
        priorOrders(1, false);
      } else {
        const other = pick(r, CITIES.filter(([, c]) => c !== buyer.country))[1];
        tx.risk = { avs: "no_match", cvv: "unavailable", ipCountry: other, deviceId };
        tx.shipment!.deliveredTo = `${int(r, 2, 180)} ${pick(r, STREETS)}, ${pick(r, CITIES)[0]}`;
        tx.shippingAddress = tx.shipment!.deliveredTo;
      }
      break;
    }
    case "DUPLICATE_TRANSACTION": {
      delivered();
      const second: Transaction = JSON.parse(JSON.stringify(tx));
      second.id = code(r, 17);
      second.date = iso(txDate + (variant === "concede" || variant === "strong_alt" ? 2 * 60_000 : 3 * DAY));
      second.invoiceId = variant === "strong" ? `KT-${10400 + index * 7 + 50}` : tx.invoiceId;
      second.messages = [];
      if (variant === "strong") {
        const other = pick(r, PRODUCTS.filter((p) => p.kind === "physical" && p.sku !== product.sku && p.price === product.price)) ?? null;
        if (other) second.items = [{ name: other.name, sku: other.sku, quantity: 1, unitPrice: other.price, description: other.description }];
        else second.items = tx.items.map((it) => ({ ...it, name: it.name + " (second order)", sku: it.sku + "-B" }));
        second.shipment = { ...tx.shipment!, trackingNumber: `${carrier.slice(0, 2).toUpperCase()}${code(r, 10)}` };
      } else {
        second.shipment = undefined;
      }
      if (variant === "strong_alt") {
        tx.refunds.push({ id: code(r, 17), at: iso(txDate + DAY), amount: total });
        said("merchant", "Our checkout charged you twice; the second charge has been refunded in full.", txDate + DAY);
      }
      extra.push(second);
      break;
    }
    case "CREDIT_NOT_PROCESSED": {
      delivered();
      const at = Date.parse(tx.shipment!.deliveredAt!);
      if (variant === "strong") {
        tx.returnRequest = { requestedAt: iso(at + 5 * DAY), receivedAt: iso(at + 12 * DAY) };
        tx.refunds.push({ id: code(r, 17), at: iso(at + 13 * DAY), amount: total });
        said("merchant", "Return received and refunded today. It can take 3-5 days to show.", at + 13 * DAY);
      } else if (variant === "strong_alt") {
        tx.returnRequest = { requestedAt: iso(at + 46 * DAY) };
        said("buyer", "I'd like to return this please.", at + 46 * DAY);
        said("merchant", "Sorry, our 30-day return window closed on this order.", at + 46 * DAY + 6 * HOUR);
      } else if (variant === "weak") {
        tx.returnRequest = { requestedAt: iso(at + 33 * DAY) };
        tx.policy.shownAtCheckout = false;
      } else {
        tx.returnRequest = { requestedAt: iso(at + 6 * DAY), receivedAt: iso(at + 14 * DAY) };
        said("merchant", "Thanks, we'll process your refund shortly.", at + 14 * DAY);
      }
      break;
    }
    case "INCORRECT_AMOUNT": {
      delivered();
      if (variant === "concede") {
        tx.amount.value = Math.round((total + 9.95) * 100) / 100;
        tx.checkoutTotalShown = total;
      }
      break;
    }
    case "CANCELED_RECURRING_BILLING": {
      const startedAt = txDate - int(r, 90, 240) * DAY;
      tx.subscription = { plan: "Monthly", startedAt: iso(startedAt), termsAcceptedAt: iso(startedAt) };
      if (variant === "strong") tx.subscription.lastUsedAt = iso(txDate + 6 * DAY);
      if (variant === "weak") tx.subscription.termsAcceptedAt = undefined;
      if (variant === "concede") {
        tx.subscription.cancelledAt = iso(txDate - 4 * DAY);
        said("buyer", "Please cancel my subscription.", txDate - 4 * DAY);
      }
      delivered();
      break;
    }
    case "PAYMENT_BY_OTHER_MEANS": {
      delivered();
      if (variant === "concede") {
        said("buyer", "I paid this invoice by bank transfer yesterday, reference " + tx.invoiceId + ".", txDate - DAY);
        said("merchant", "Thanks, we can see your transfer.", txDate - DAY + 3 * HOUR);
        extra.push({ ...JSON.parse(JSON.stringify(tx)), id: code(r, 17), date: iso(txDate - DAY), messages: [], items: tx.items, shipment: undefined, note: "Recorded as paid by bank transfer" });
      }
      break;
    }
  }

  const dispute: Dispute = {
    id: `PP-D-${100000 + index * 37 + int(r, 0, 30)}`,
    origin: "seeded",
    reason,
    status: "WAITING_FOR_SELLER_RESPONSE",
    stage: reason === "UNAUTHORISED" && r() > 0.5 ? "CHARGEBACK" : "INQUIRY",
    amount: { value: tx.amount.value, currency: "USD" },
    createdAt: iso(createdAt),
    responseDueAt: iso(responseDueAt),
    buyerClaim: pick(r, CLAIMS[reason]),
    buyer: tx.buyer,
    transactionId: tx.id,
  };
  return { disputes: [dispute], transactions: [tx, ...extra] };
}

export function seedWorkspace(now: number, seed = 20261102): SeedData {
  const r = rng(seed);
  const names = [...PEOPLE].sort(() => r() - 0.5);
  const out: SeedData = { disputes: [], transactions: [] };
  PLAN.forEach(([reason, variant], i) => {
    const one = buildCase(r, i, reason, variant, now, names[i % names.length], DUE_HOURS[i % DUE_HOURS.length] + Math.floor(i / DUE_HOURS.length) * 13);
    out.disputes.push(...one.disputes);
    out.transactions.push(...one.transactions);
  });
  return out;
}

export function freshDispute(now: number, counter: number): SeedData {
  const r = rng(now ^ (counter * 2654435761));
  const [reason, variant] = pick(r, PLAN);
  const one = buildCase(r, 900 + counter, reason, variant, now, pick(r, PEOPLE), int(r, 30, 160));
  one.disputes[0].createdAt = iso(now);
  return one;
}
