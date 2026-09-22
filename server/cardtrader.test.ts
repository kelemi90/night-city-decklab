import { describe, expect, it } from "vitest";
import {
  calculateCardTraderPrices,
  CardTraderConfigurationError,
  isCardTraderConfigured,
} from "./cardtrader";

describe("CardTrader provider", () => {
  it("reports that live pricing is disabled until both credentials are configured", () => {
    expect(isCardTraderConfigured()).toBe(false);
  });

  it("uses a distinct configuration error type for missing provider setup", () => {
    const error = new CardTraderConfigurationError("missing credentials");
    expect(error.code).toBe("CARDTRADER_NOT_CONFIGURED");
    expect(error.message).toContain("missing credentials");
  });
});

describe("calculateCardTraderPrices", () => {
  it("removes an extreme outlier from marketplace listings", () => {
    const result = calculateCardTraderPrices([
      104,
      114,
      511,
      500064,
    ]);

    expect(result).toEqual({
      marketCents: 313,
      lowCents: 104,
      highCents: 511,
    });
  });

  it("removes multiple extreme high-price listings", () => {
    const result = calculateCardTraderPrices([
      59,
      69,
      511,
      100064,
      500064,
    ]);

    expect(result).toEqual({
      marketCents: 511,
      lowCents: 59,
      highCents: 511,
    });
  });

  it("keeps normal variation between marketplace listings", () => {
    const result = calculateCardTraderPrices([
      1014,
      1015,
      1035,
      1171,
    ]);

    expect(result).toEqual({
      marketCents: 1025,
      lowCents: 1014,
      highCents: 1171,
    });
  });

  it("does not apply statistical filtering to three or fewer listings", () => {
    expect(calculateCardTraderPrices([104, 511])).toEqual({
      marketCents: 308,
      lowCents: 104,
      highCents: 511,
    });

    expect(calculateCardTraderPrices([104, 114, 511])).toEqual({
      marketCents: 114,
      lowCents: 104,
      highCents: 511,
    });
  });

  it("returns null when there are no valid listings", () => {
    expect(calculateCardTraderPrices([])).toBeNull();
  });

  it("uses the average of the two middle listings for an even number of prices", () => {
    const result = calculateCardTraderPrices([
      100,
      200,
      300,
      400,
    ]);

    expect(result).toEqual({
      marketCents: 250,
      lowCents: 100,
      highCents: 400,
    });
  });
});