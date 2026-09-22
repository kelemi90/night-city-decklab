import { describe, expect, it } from "vitest";
import { ownedCatalogRows, validateRecommendation } from "./deckAdvisor";

const owned = ownedCatalogRows([
  { cardId: 1, quantity: 1 },
  { cardId: 2, quantity: 1 },
  { cardId: 3, quantity: 1 },
  { cardId: 8, quantity: 3 },
]);

describe("AI deck advisor guardrails", () => {
  it("normalizes collection rows to official catalog cards", () => {
    expect(owned).toHaveLength(4);
    expect(owned.find((card) => card.id === 1)?.name).toBe("V");
    expect(owned.find((card) => card.id === 8)?.ownedQuantity).toBe(3);
  });

  it("rejects recommendations that are not legal or exceed owned quantities", () => {
    const result = validateRecommendation({
      name: "Invalid test deck",
      strategy: "test",
      summary: "test",
      whyLegends: [],
      legends: [{ cardId: 1, quantity: 1 }, { cardId: 2, quantity: 1 }, { cardId: 3, quantity: 1 }],
      main: [{ cardId: 8, quantity: 4 }],
      upgradeSuggestions: [],
      totalMain: 4,
    }, owned);
    expect(result.legal).toBe(false);
    expect(result.errors.some((error) => error.includes("more copies") || error.includes("between 40 and 50"))).toBe(true);
  });

  it("rejects duplicate main-card lines from an AI candidate", () => {
    const result = validateRecommendation({
      name: "Duplicate test deck", strategy: "aggro", summary: "test", whyLegends: [],
      legends: [{ cardId: 1, quantity: 1 }, { cardId: 2, quantity: 1 }, { cardId: 3, quantity: 1 }],
      main: [{ cardId: 8, quantity: 2 }, { cardId: 8, quantity: 1 }], upgradeSuggestions: [], totalMain: 3,
    }, owned);
    expect(result.legal).toBe(false);
    expect(result.errors.some((error) => error.includes("multiple main-deck lines"))).toBe(true);
  });
});
