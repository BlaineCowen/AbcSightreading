import { describe, expect, test } from "bun:test";
import {
  INVOICE_DAYS,
  QUOTE_DAYS,
  REMIND_DAYS,
  checkPoNumber,
  checkQuoteRequest,
  invoiceStanding,
  quoteItems,
} from "../../src/lib/quote";

/**
 * School quotes (billing, stage 4b). Written before the code.
 *
 * A teacher asks for a quote for the Educator plan and any seat packs; the
 * school's purchasing office gets a PDF, sends a purchase order, and the
 * teacher enters its number. These are the rules the request is held to.
 */

const valid = {
  school: "Lincoln Middle School",
  district: "Springfield ISD",
  contactName: "Pat Jones",
  contactEmail: "purchasing@springfield.k12.tx.us",
  address: { line1: "100 School Rd", city: "Springfield", state: "TX", postalCode: "75001" },
  packs: 2,
  taxExempt: true,
};

describe("a quote request", () => {
  test("a complete request is tidied and kept", () => {
    const r = checkQuoteRequest({ ...valid, school: "  Lincoln Middle School ", contactEmail: " Purchasing@Springfield.k12.tx.us" });
    expect(r).toEqual({
      ok: true,
      value: {
        ...valid,
        plan: "educator",
        contactEmail: "purchasing@springfield.k12.tx.us",
        sendTo: ["purchasing@springfield.k12.tx.us"],
        address: { ...valid.address, line2: "", country: "US" },
        renews: false,
      },
    });
  });

  test("district, seat packs and tax exemption are optional", () => {
    const { district: _d, packs: _p, taxExempt: _t, ...bare } = valid;
    const r = checkQuoteRequest(bare);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ district: "", packs: 0, taxExempt: false });
  });

  test("one year only unless renewing each year is asked for", () => {
    const one = checkQuoteRequest(valid);
    if (one.ok) expect(one.value.renews).toBe(false);
    const yearly = checkQuoteRequest({ ...valid, renews: true });
    if (yearly.ok) expect(yearly.value.renews).toBe(true);
  });

  test("refuses what would make a quote the office cannot use", () => {
    expect(checkQuoteRequest({ ...valid, school: "" }).ok).toBe(false);
    expect(checkQuoteRequest({ ...valid, contactEmail: "not an email" }).ok).toBe(false);
    expect(checkQuoteRequest({ ...valid, address: { ...valid.address, postalCode: "7500" } }).ok).toBe(false);
    expect(checkQuoteRequest({ ...valid, address: { ...valid.address, state: "Texas" } }).ok).toBe(false);
    expect(checkQuoteRequest({ ...valid, packs: -1 }).ok).toBe(false);
    expect(checkQuoteRequest({ ...valid, packs: 1.5 }).ok).toBe(false);
    expect(checkQuoteRequest({ ...valid, packs: 41 }).ok).toBe(false);
    expect(checkQuoteRequest({ ...valid, school: "x".repeat(201) }).ok).toBe(false);
    expect(checkQuoteRequest(null).ok).toBe(false);
  });

  test("a ZIP+4 and a lower-case state are fine", () => {
    const r = checkQuoteRequest({ ...valid, address: { ...valid.address, state: "tx", postalCode: "75001-1234" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.address.state).toBe("TX");
  });
});

describe("what a quote is for", () => {
  test("the Educator year, and seat packs when asked for", () => {
    expect(quoteItems("educator", 0)).toEqual([{ price: "educator_yearly", quantity: 1 }]);
    expect(quoteItems("educator", 3)).toEqual([
      { price: "educator_yearly", quantity: 1 },
      { price: "seat_pack_25", quantity: 3 },
    ]);
  });

  test("a Pro year, on its own", () => {
    expect(quoteItems("pro", 0)).toEqual([{ price: "pro_yearly", quantity: 1 }]);
  });

  test("good for sixty days - purchasing offices are slow", () => {
    expect(QUOTE_DAYS).toBe(60);
  });
});

describe("a purchase order number", () => {
  test("whatever the district's format, within reason", () => {
    expect(checkPoNumber(" PO-2026-00417 ")).toEqual({ ok: true, value: "PO-2026-00417" });
    expect(checkPoNumber("4500012345").ok).toBe(true);
    expect(checkPoNumber("").ok).toBe(false);
    expect(checkPoNumber("x".repeat(41)).ok).toBe(false);
    expect(checkPoNumber(42).ok).toBe(false);
  });
});

/**
 * Pro on a purchase order (29 Sept 2026): the teacher sends the quote straight
 * to up to three purchasing addresses in one go, and a plan whose invoice is
 * not paid within the month ends.
 */
describe("a Pro quote, sent straight to purchasing", () => {
  const pro = { ...valid, plan: "pro", packs: 0 };

  test("a Pro quote has no seat packs", () => {
    const r = checkQuoteRequest(pro);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.plan).toBe("pro");
    expect(checkQuoteRequest({ ...pro, packs: 2 }).ok).toBe(false);
  });

  test("an unknown plan is refused", () => {
    expect(checkQuoteRequest({ ...valid, plan: "platinum" }).ok).toBe(false);
  });

  test("up to three addresses, tidied and without repeats; the first is billed", () => {
    const r = checkQuoteRequest({
      ...pro,
      contactEmail: undefined,
      sendTo: [" Buyer@ISD.org ", "bookkeeper@school.org", "buyer@isd.org", ""],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.sendTo).toEqual(["buyer@isd.org", "bookkeeper@school.org"]);
      expect(r.value.contactEmail).toBe("buyer@isd.org");
    }
  });

  test("a comma-separated list works too", () => {
    const r = checkQuoteRequest({ ...pro, contactEmail: undefined, sendTo: "a@isd.org, b@isd.org" });
    expect(r.ok && r.value.sendTo).toEqual(["a@isd.org", "b@isd.org"]);
  });

  test("more than three, or one that is not an address, is refused", () => {
    expect(checkQuoteRequest({ ...pro, sendTo: ["a@x.org", "b@x.org", "c@x.org", "d@x.org"] }).ok).toBe(false);
    expect(checkQuoteRequest({ ...pro, contactEmail: undefined, sendTo: ["a@x.org", "nope"] }).ok).toBe(false);
    expect(checkQuoteRequest({ ...pro, contactEmail: undefined, sendTo: [] }).ok).toBe(false);
  });
});

describe("an invoice on a purchase order", () => {
  const day = 86_400_000;
  const issued = new Date("2026-10-01T15:00:00Z");
  const dueAt = new Date(issued.getTime() + INVOICE_DAYS * day);
  const at = (days: number) => new Date(issued.getTime() + days * day);

  test("net 30, with a reminder a week before", () => {
    expect(INVOICE_DAYS).toBe(30);
    expect(REMIND_DAYS).toBe(7);
  });

  test("paid is paid, whenever", () => {
    expect(invoiceStanding({ dueAt, paid: true, reminded: false, now: at(45) })).toBe("paid");
  });

  test("nothing to do in the first three weeks", () => {
    expect(invoiceStanding({ dueAt, paid: false, reminded: false, now: at(1) })).toBe("waiting");
    expect(invoiceStanding({ dueAt, paid: false, reminded: false, now: at(22.9) })).toBe("waiting");
  });

  test("a week before it is due: one reminder", () => {
    expect(invoiceStanding({ dueAt, paid: false, reminded: false, now: at(23) })).toBe("remind");
    expect(invoiceStanding({ dueAt, paid: false, reminded: true, now: at(25) })).toBe("waiting");
  });

  test("unpaid when it falls due: the plan ends", () => {
    expect(invoiceStanding({ dueAt, paid: false, reminded: true, now: at(30) })).toBe("lapse");
    expect(invoiceStanding({ dueAt, paid: false, reminded: false, now: at(31) })).toBe("lapse");
  });
});

