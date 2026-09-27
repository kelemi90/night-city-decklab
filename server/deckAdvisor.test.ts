import { describe, expect, it, vi } from "vitest";

const { invokeLLM } = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM,
}));

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
              summary: "test",
              whyLegends: ["test", "test", "test"],
              legends: [
                { cardId: 1, quantity: 1 },
                { cardId: 2, quantity: 1 },
                { cardId: 3, quantity: 1 },
              ],
              main: [
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
              ],
              upgradeSuggestions: [],
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
      expect(invokeLLM).toHaveBeenCalledTimes(1);

      const request = invokeLLM.mock.calls.at(-1)?.[0];
      const userMessage = request.messages.find(
        (message: { role: string }) => message.role === "user",
      );

      expect(userMessage?.content).toContain('"marketCents"');
      expect(userMessage?.content).toContain('"ownedQuantity":1');
      expect(userMessage?.content).toContain(
        `speed=${speed}, control=${control}, budget=${budget}`,
      );
      expect(userMessage?.content).toContain("high-market-value");
      expect(userMessage?.content).toContain("lower market value");
    },
  );
});

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
      legends: [
        { cardId: 1, quantity: 1 },
        { cardId: 2, quantity: 1 },
        { cardId: 3, quantity: 1 },
      ],
      main: [{ cardId: 8, quantity: 4 }],
      upgradeSuggestions: [],
      totalMain: 4,
    }, owned);

    expect(result.legal).toBe(false);
    expect(
      result.errors.some(
        (error) =>
          error.includes("more copies") ||
          error.includes("between 40 and 50"),
      ),
    ).toBe(true);
  });

  it("rejects duplicate main-card lines from an AI candidate", () => {
    const result = validateRecommendation({
      name: "Duplicate test deck",
      strategy: "aggro",
      summary: "test",
      whyLegends: [],
      legends: [
        { cardId: 1, quantity: 1 },
        { cardId: 2, quantity: 1 },
        { cardId: 3, quantity: 1 },
      ],
      main: [
        { cardId: 8, quantity: 2 },
        { cardId: 8, quantity: 1 },
      ],
      upgradeSuggestions: [],
      totalMain: 3,
    }, owned);

    expect(result.legal).toBe(false);
    expect(
      result.errors.some((error) =>
        error.includes("multiple main-deck lines"),
      ),
    ).toBe(true);
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
