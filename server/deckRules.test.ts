import { describe, expect, it } from "vitest";
import { CATALOG_CARDS, PRICE_CURRENCY, validateDeck } from "../shared/deckRules";

function cardId(name: string) {
  const card = CATALOG_CARDS.find((item) => item.name === name);
  if (!card) throw new Error(`Missing test card: ${name}`);
  return card.id;
}

describe("Cyberpunk deck rules", () => {
  it("uses euros for seeded catalog market values", () => {
    expect(PRICE_CURRENCY).toBe("EUR");
  });

  it("accepts a three-Legend deck with 40 cards inside color RAM ceilings", () => {
    const mainCard = CATALOG_CARDS.find((card) => card.kind !== "legend" && card.color === "red");
    if (!mainCard) throw new Error("Missing red main-deck test card");
    const main = [{ cardId: mainCard.id, quantity: 40 }];
    const result = validateDeck([cardId("V"), cardId("Royce"), cardId("Adam Smasher")], main);
    expect(result.totalMain).toBe(40);
    expect(result.legal).toBe(false);
    expect(result.errors.some((error) => error.includes("40 copies"))).toBe(true);
  });

  it("rejects duplicate Legends and decks outside the 40-50 range", () => {
    const result = validateDeck([cardId("V"), cardId("V"), cardId("Royce")], [{ cardId: cardId("Japantown Jonin"), quantity: 3 }]);
    expect(result.legal).toBe(false);
    expect(result.errors).toContain("Legend names must be unique.");
    expect(result.errors.some((error) => error.includes("between 40 and 50"))).toBe(true);
  });

  it("enforces RAM per color rather than as a single global pool", () => {
    const legends = ["V", "Rogue Amendiares", "Evelyn Parker"].map((name) => cardId(name));
    const result = validateDeck(legends, [{ cardId: cardId("Japantown Jonin"), quantity: 1 }]);
    expect(Object.keys(result.ram).length).toBeGreaterThan(0);
    expect(result.errors.some((error) => error.includes("RAM"))).toBe(false);
  });
});
