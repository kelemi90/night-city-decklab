import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeLLM } = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM,
}));

beforeEach(() => {
  invokeLLM.mockReset();
});

import {
  deduplicateRecommendations,
  ownedCatalogRows,
  recommendationDeckKey,
  recommendDeck,
  validateRecommendation,
} from "./deckAdvisor";

const owned = ownedCatalogRows([
  { cardId: 1, quantity: 1 },
  { cardId: 2, quantity: 1 },
  { cardId: 3, quantity: 1 },
  { cardId: 8, quantity: 3 },
]);

describe("AI deck advisor preference payload", () => {
  const weights = [
    { speed: 85, control: 25, budget: 10, label: "speed-heavy" },
    { speed: 25, control: 90, budget: 65, label: "control-heavy" },
    { speed: 50, control: 50, budget: 90, label: "budget-heavy" },
  ];

  it.each(weights)(
    "passes $label weighting to the LLM",
    async ({ speed, control, budget }) => {
      invokeLLM.mockClear();
      invokeLLM.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              name: "Preference test deck",
              strategy: "weighted test",
              legends: [
                { cardId: 1 },
                { cardId: 2 },
                { cardId: 3 },
              ],
              mainCandidates: [
                { cardId: 8 },
                { cardId: 9 },
                { cardId: 10 },
                { cardId: 11 },
                { cardId: 12 },
                { cardId: 13 },
                { cardId: 14 },
                { cardId: 15 },
                { cardId: 16 },
                { cardId: 17 },
                { cardId: 18 },
                { cardId: 19 },
                { cardId: 20 },
                { cardId: 21 },
              ],
            }),
          },
        }],
      });

      const result = await recommendDeck(
        ownedCatalogRows([
          { cardId: 1, quantity: 1 },
          { cardId: 2, quantity: 1 },
          { cardId: 3, quantity: 1 },
          { cardId: 8, quantity: 3 },
          { cardId: 9, quantity: 3 },
          { cardId: 10, quantity: 3 },
          { cardId: 11, quantity: 3 },
          { cardId: 12, quantity: 3 },
          { cardId: 13, quantity: 3 },
          { cardId: 14, quantity: 3 },
          { cardId: 15, quantity: 3 },
          { cardId: 16, quantity: 3 },
          { cardId: 17, quantity: 3 },
          { cardId: 18, quantity: 3 },
          { cardId: 19, quantity: 3 },
          { cardId: 20, quantity: 2 },
          { cardId: 21, quantity: 2 },
        ]),
        "aggro",
        { speed, control, budget },
      );

      expect(result.strategy).toBe("weighted test");
      expect(result.totalMain).toBe(40);
      expect(invokeLLM).toHaveBeenCalledTimes(1);

      const request = invokeLLM.mock.calls.at(-1)?.[0];
      const userMessage = request.messages.find(
        (message: { role: string }) => message.role === "user",
      );

      expect(userMessage?.content).toContain('"marketCents"');
      expect(userMessage?.content).toContain(
        "OWNED LEGENDS — choose exactly 3 unique cards from this list:",
      );
      expect(userMessage?.content).toContain(
        "OWNED MAIN-DECK CARDS — rank preferred cards ONLY from this list:",
      );
      expect(userMessage?.content).toContain(
        "Only cards listed under OWNED LEGENDS may appear in the Legends list.",
      );
      expect(userMessage?.content).toContain(
        "Only cards listed under OWNED MAIN-DECK CARDS may appear in mainCandidates.",
      );
      expect(userMessage?.content).toContain(
        '"ownedQuantity":1',
      );
      expect(userMessage?.content).toContain(
        `speed=${speed}, control=${control}, budget=${budget}`,
      );
      expect(userMessage?.content).toContain("higher-value cards");
      expect(userMessage?.content).toContain("lower-value cards");
      expect(userMessage?.content).toContain(
        "Do NOT choose quantities.",
      );
      expect(userMessage?.content).toContain(
        "The application will determine quantities from ownedQuantity.",
      );
      expect(userMessage?.content).toContain(
        "The application will enforce the 40–50 card limit and maximum 3 copies.",
      );
    },
  );
});

describe("AI deck advisor deterministic deck builder", () => {
  const fullOwnedCollection = ownedCatalogRows([
    { cardId: 1, quantity: 1 },
    { cardId: 2, quantity: 1 },
    { cardId: 3, quantity: 1 },
    { cardId: 8, quantity: 3 },
    { cardId: 9, quantity: 3 },
    { cardId: 10, quantity: 3 },
    { cardId: 11, quantity: 3 },
    { cardId: 12, quantity: 3 },
    { cardId: 13, quantity: 3 },
    { cardId: 14, quantity: 3 },
    { cardId: 15, quantity: 3 },
    { cardId: 16, quantity: 3 },
    { cardId: 17, quantity: 3 },
    { cardId: 18, quantity: 3 },
    { cardId: 19, quantity: 3 },
    { cardId: 20, quantity: 2 },
    { cardId: 21, quantity: 2 },
  ]);

  it("uses AI candidate order but derives legal quantities from the collection", async () => {
    invokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            name: "Deterministic build",
            strategy: "aggro",
            legends: [
              { cardId: 1 },
              { cardId: 2 },
              { cardId: 3 },
            ],
            mainCandidates: [
              { cardId: 8 },
              { cardId: 9 },
              { cardId: 10 },
              { cardId: 11 },
              { cardId: 12 },
              { cardId: 13 },
              { cardId: 14 },
              { cardId: 15 },
              { cardId: 16 },
              { cardId: 17 },
              { cardId: 18 },
              { cardId: 19 },
              { cardId: 20 },
              { cardId: 21 },
            ],
          }),
        },
      }],
    });

    const result = await recommendDeck(
      fullOwnedCollection,
      "aggro",
      { speed: 85, control: 25, budget: 10 },
      "ollama",
    );

    expect(result.totalMain).toBe(40);
    expect(result.legends.map((line) => line.cardId)).toEqual([1, 2, 3]);
    expect(result.main.map((line) => line.cardId)).toEqual([
      8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    ]);

    expect(result.main.find((line) => line.cardId === 8)?.quantity).toBe(3);
    expect(result.main.find((line) => line.cardId === 20)?.quantity).toBe(2);
    expect(result.main.find((line) => line.cardId === 21)?.quantity).toBe(2);

    expect(
      result.main.every((line) => line.quantity >= 1 && line.quantity <= 3),
    ).toBe(true);

    expect(
      result.main.every((line) => {
        const ownedCard = fullOwnedCollection.find(
          (card) => card.id === line.cardId,
        );
        return ownedCard !== undefined &&
          line.quantity <= ownedCard.ownedQuantity;
      }),
    ).toBe(true);

    expect(invokeLLM).toHaveBeenCalledTimes(1);
    expect(invokeLLM.mock.calls[0]?.[0].provider).toBe("ollama");
  });

  it("fills the deck from owned cards when the AI provides too few candidates", async () => {
    invokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            name: "Fallback build",
            strategy: "midrange",
            legends: [
              { cardId: 1 },
              { cardId: 2 },
              { cardId: 3 },
            ],
            mainCandidates: [
              { cardId: 8 },
            ],
          }),
        },
      }],
    });

    const result = await recommendDeck(
      fullOwnedCollection,
      "midrange",
      { speed: 50, control: 50, budget: 50 },
      "lmstudio",
    );

    expect(result.totalMain).toBe(40);
    expect(result.main[0]).toEqual({
      cardId: 8,
      quantity: 3,
    });
    expect(result.main.length).toBeGreaterThan(1);

    expect(
      result.main.every((line) => line.cardId !== 1 && line.cardId !== 2 && line.cardId !== 3),
    ).toBe(true);

    expect(
      result.main.every((line) => line.quantity >= 1 && line.quantity <= 3),
    ).toBe(true);

    expect(invokeLLM).toHaveBeenCalledTimes(1);
    expect(invokeLLM.mock.calls[0]?.[0].provider).toBe("lmstudio");
  });
});

describe("AI deck advisor candidate deduplication", () => {
  const base = {
    name: "Deck A",
    strategy: "aggro",
    summary: "test",
    whyLegends: [],
    legends: [
      { cardId: 1, quantity: 1 },
      { cardId: 2, quantity: 1 },
      { cardId: 3, quantity: 1 },
    ],
    main: [
      { cardId: 8, quantity: 3 },
      { cardId: 9, quantity: 2 },
    ],
    upgradeSuggestions: [],
    totalMain: 5,
  };

  it("uses only the actual deck composition for its fingerprint", () => {
    const reordered = {
      ...base,
      name: "Different name",
      strategy: "tempo",
      legends: [...base.legends].reverse(),
      main: [...base.main].reverse(),
    };

    expect(recommendationDeckKey(base)).toBe(
      recommendationDeckKey(reordered),
    );
  });

  it("removes exact duplicate deck compositions while preserving order", () => {
    const duplicate = {
      ...base,
      name: "Tempo version",
      strategy: "tempo",
      summary: "same cards, different AI explanation",
    };

    const distinct = {
      ...base,
      name: "Control deck",
      strategy: "control",
      legends: [
        { cardId: 1, quantity: 1 },
        { cardId: 2, quantity: 1 },
        { cardId: 4, quantity: 1 },
      ],
    };

    const result = deduplicateRecommendations([
      base,
      duplicate,
      distinct,
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(base);
    expect(result[1]).toBe(distinct);
  });
});
