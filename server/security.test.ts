import { describe, expect, it } from "vitest";
import { validateShareExpiry } from "./routers";

describe("security hardening", () => {
  it("rejects expired share links and accepts a bounded future expiry", () => {
    expect(() => validateShareExpiry(new Date(Date.now() - 1_000))).toThrow(/within the next 366 days/);
    expect(() => validateShareExpiry(new Date(Date.now() + 367 * 24 * 60 * 60 * 1000))).toThrow(/within the next 366 days/);
    expect(validateShareExpiry(new Date(Date.now() + 24 * 60 * 60 * 1000))).toBeInstanceOf(Date);
  });

  it("allows a share without an expiry", () => {
    expect(validateShareExpiry(null)).toBeNull();
    expect(validateShareExpiry(undefined)).toBeUndefined();
  });
});
