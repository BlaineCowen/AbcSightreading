import { describe, expect, test } from "bun:test";
import { QUOTE_DAYS, checkPoNumber, checkQuoteRequest, quoteItems } from "../../src/lib/quote";

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
      value: { ...valid, contactEmail: "purchasing@springfield.k12.tx.us", address: { ...valid.address, line2: "", country: "US" } },
    });
  });

  test("district, seat packs and tax exemption are optional", () => {
    const { district: _d, packs: _p, taxExempt: _t, ...bare } = valid;
    const r = checkQuoteRequest(bare);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ district: "", packs: 0, taxExempt: false });
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
    expect(quoteItems(0)).toEqual([{ price: "educator_yearly", quantity: 1 }]);
    expect(quoteItems(3)).toEqual([
      { price: "educator_yearly", quantity: 1 },
      { price: "seat_pack_25", quantity: 3 },
    ]);
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
