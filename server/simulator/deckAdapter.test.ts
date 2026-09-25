import { describe, expect, it } from "vitest";

import type { CatalogCard } from "../../shared/deckRules";
import type { DeckRecommendation } from "../deckAdvisor";
import {
  recommendationToSimulatorDeck,
} from "./deckAdapter";

function card(
  id: number,
  kind: CatalogCard["kind"],
  name: string,
): CatalogCard {
  return {
    id,
    name,
    kind,
    color: "red",
    ram: 1,
    rarity: "Common",
    setName: "Test",
    marketCents: 0,
    sourceUrl: "",
    imageUrl: "",
  };
}

const catalog = [
  card(1, "legend", "Legend One"),
  card(2, "legend", "Legend Two"),
  card(3, "legend", "Legend Three"),
  card(10, "unit", "Unit Ten"),
  card(11, "unit", "Unit Eleven"),
];

const recommendation: DeckRecommendation = {
  name: "Test Deck",
  strategy: "midrange",
  summary: "Test",
  whyLegends: [],
  legends: [
    { cardId: 1, quantity: 1 },
    { cardId: 2, quantity: 1 },
    { cardId: 3, quantity: 1 },
  ],
  main: [
    { cardId: 10, quantity: 3 },
    { cardId: 11, quantity: 2 },
  ],
  upgradeSuggestions: [],
  totalMain: 5,
};

describe("Cyberpunk TCG deck adapter", () => {
  it("expands a recommendation into simulator cards", async () => {
    const deck = await recommendationToSimulatorDeck(
      recommendation,
      catalog,
    );

    expect(deck.legends).toHaveLength(3);
    expect(deck.main).toHaveLength(5);

    expect(
      deck.main.filter((card) => card.id === 10),
    ).toHaveLength(3);

    expect(
      deck.main.filter((card) => card.id === 11),
    ).toHaveLength(2);
  });

  it("preserves card properties", async () => {
    const deck = await recommendationToSimulatorDeck(
      recommendation,
      catalog,
    );

    expect(deck.main[0]).toMatchObject({
      id: 10,
      name: "Unit Ten",
      kind: "unit",
      color: "red",
      ram: 1,
    });
  });

  it("rejects an unknown card", async () => {
    const invalid: DeckRecommendation = {
      ...recommendation,
      main: [
        { cardId: 999, quantity: 1 },
      ],
    };

    await expect(
      recommendationToSimulatorDeck(
        invalid,
        catalog,
      ),
    ).rejects.toThrow(
      "Card 999 could not be converted",
    );
  });
});
