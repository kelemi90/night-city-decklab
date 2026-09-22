import { describe, expect, it } from "vitest";
import { isDeckShareActive } from "./db";

describe("isDeckShareActive", () => {
  const now = new Date("2026-09-18T00:00:00.000Z");

  it("allows a share without an expiry", () => {
    expect(isDeckShareActive({ expiresAt: null, revokedAt: null }, now)).toBe(true);
  });

  it("blocks expired and revoked shares", () => {
    expect(isDeckShareActive({ expiresAt: new Date("2026-09-17T23:59:59.000Z"), revokedAt: null }, now)).toBe(false);
    expect(isDeckShareActive({ expiresAt: null, revokedAt: new Date("2026-09-17T23:59:59.000Z") }, now)).toBe(false);
  });

  it("allows a future expiry until the exact deadline", () => {
    expect(isDeckShareActive({ expiresAt: new Date("2026-09-18T00:00:01.000Z"), revokedAt: null }, now)).toBe(true);
  });
});
