import { describe, expect, test } from "bun:test";
import { isConnectionError } from "../../src/lib/server/db-errors";
import { cachedPlan, changesPlan, decode, encode, withPlanCache, noteSignedIn, COOKIE } from "../../src/lib/server/plan-cache";

const KEY = "test-secret";

describe("plan cookie", () => {
  test("round trips and rejects edits", () => {
    const v = { userId: "abc123", plan: "pro" as const, at: 1_700_000_000_000 };
    const raw = encode(v, KEY)!;
    expect(decode(raw, KEY)).toEqual(v);
    expect(decode(raw.replace(".pro.", ".educator."), KEY)).toBeUndefined();
    expect(decode(raw.replace("abc123", "someone"), KEY)).toBeUndefined();
    expect(decode(raw, "other-secret")).toBeUndefined();
    expect(decode("junk", KEY)).toBeUndefined();
    expect(decode(undefined, KEY)).toBeUndefined();
  });
});

describe("requests that change the plan", () => {
  const u = (p: string) => new URL("https://www.abc-sightreading.com" + p);
  test("posts to billing, codes, the free month, joining", () => {
    expect(changesPlan("POST", u("/api/codes/redeem"))).toBe(true);
    expect(changesPlan("POST", u("/api/free-month"))).toBe(true);
    expect(changesPlan("POST", u("/api/join"))).toBe(true);
    expect(changesPlan("GET", u("/account?upgraded=pro"))).toBe(true);
  });
  test("not ordinary pages and saves", () => {
    expect(changesPlan("GET", u("/tuner"))).toBe(false);
    expect(changesPlan("GET", u("/api/billing"))).toBe(false);
    expect(changesPlan("POST", u("/api/usage"))).toBe(false);
    expect(changesPlan("POST", u("/api/joint"))).toBe(false);
  });
});

describe("cachedPlan", () => {
  test("joins lookups made at once, then remembers", async () => {
    let calls = 0;
    const lookup = async () => {
      calls++;
      await Bun.sleep(5);
      return "pro" as const;
    };
    const [a, b] = await Promise.all([cachedPlan("u-join", lookup), cachedPlan("u-join", lookup)]);
    expect([a, b]).toEqual(["pro", "pro"]);
    expect(await cachedPlan("u-join", lookup)).toBe("pro");
    expect(calls).toBe(1);
  });

  test("a dead connection falls back to the plan known; other errors do not", async () => {
    await cachedPlan("u-stale", async () => "educator");
    const dead = new Error("Query read timeout");
    // Memory is fresh, so no lookup happens at all.
    expect(await cachedPlan("u-stale", async () => { throw dead; })).toBe("educator");
    // Unknown account: the error comes through.
    await expect(cachedPlan("u-none", async () => { throw dead; })).rejects.toThrow("Query read timeout");
    await expect(cachedPlan("u-none", async () => { throw new Error("bad column"); })).rejects.toThrow("bad column");
  });

  test("writes a cookie only for the signed-in account, and a plan change clears it", async () => {
    process.env.BETTER_AUTH_SECRET = KEY;
    const url = new URL("https://x.test/tuner");
    const r1 = await withPlanCache(new Request(url), url, async () => {
      noteSignedIn("u-cookie");
      await cachedPlan("u-cookie", async () => "pro");
      return new Response("ok");
    });
    expect(r1.setCookie).toStartWith(`${COOKIE}=u-cookie.pro.`);
    const value = r1.setCookie!.split(";")[0];

    // Another account's plan looked up during the request: no cookie for it.
    const r2 = await withPlanCache(new Request(url), url, async () => {
      noteSignedIn("u-teacher");
      await cachedPlan("u-student-x", async () => "free");
      return new Response("ok");
    });
    expect(r2.setCookie).toBeUndefined();

    // The cookie answers without a lookup.
    let looked = false;
    await withPlanCache(new Request(url, { headers: { cookie: value } }), url, async () => {
      noteSignedIn("u-cookie");
      expect(await cachedPlan("u-cookie", async () => ((looked = true), "free"))).toBe("pro");
      return new Response("ok");
    });
    expect(looked).toBe(false);

    // Redeeming a code: looked up fresh, and the cookie is cleared.
    const redeem = new URL("https://x.test/api/codes/redeem");
    const r3 = await withPlanCache(new Request(redeem, { method: "POST", headers: { cookie: value } }), redeem, async () => {
      noteSignedIn("u-cookie");
      expect(await cachedPlan("u-cookie", async () => "educator")).toBe("educator");
      return new Response("ok");
    });
    expect(r3.setCookie).toContain("Max-Age=0");
  });
});

describe("isConnectionError", () => {
  test("dead sockets yes, query mistakes no", () => {
    expect(isConnectionError(new Error("Query read timeout"))).toBe(true);
    expect(isConnectionError(new Error("wrapped", { cause: new Error("Connection terminated unexpectedly") }))).toBe(true);
    expect(isConnectionError(new Error("timeout exceeded when trying to connect"))).toBe(true);
    expect(isConnectionError(new Error('column "x" does not exist'))).toBe(false);
    expect(isConnectionError(new Error("Unique constraint failed"))).toBe(false);
  });
});
