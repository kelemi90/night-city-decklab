import { invokeLLM } from "./_core/llm";
import { FULL_CATALOG, validateDeck, type CatalogCard } from "../shared/deckRules";

type OwnedCard = CatalogCard & { ownedQuantity: number };
export type StrategyGoal = "aggro" | "control" | "midrange" | "tempo";
export type StrategyWeights = { speed: number; control: number; budget: number };
export type AdvisorProvider = "ollama" | "lmstudio" | "omniroute";
export type AdvisorLine = { cardId: number; quantity: number };
export type DeckRecommendation = {
  name: string;
  strategy: string;
  summary: string;
  whyLegends: string[];
  legends: AdvisorLine[];
  main: AdvisorLine[];
  upgradeSuggestions: string[];
  totalMain: number;
};

const recommendationSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    strategy: { type: "string" },
    legends: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cardId: { type: "integer" },
        },
        required: ["cardId"],
        additionalProperties: false,
      },
    },
    mainCandidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cardId: { type: "integer" },
        },
        required: ["cardId"],
        additionalProperties: false,
      },
    },
  },
  required: ["name", "strategy", "legends", "mainCandidates"],
  additionalProperties: false,
} as const;

function contentText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("");
  return "";
}

function ownedMap(owned: OwnedCard[]) {
  return new Map(owned.map((card) => [card.id, card]));
}

export function validateRecommendation(recommendation: DeckRecommendation, owned: OwnedCard[]) {
  const byId = ownedMap(owned);
  const errors: string[] = [];
  const legendIds = recommendation.legends.map((line) => line.cardId);
  const main = recommendation.main;
  for (const line of recommendation.legends) {
    const card = byId.get(line.cardId);
    if (!card) errors.push(`Legend ${line.cardId} is not owned.`);
    else if (card.kind !== "legend") errors.push(`${card.name} is not a Legend.`);
    if (line.quantity !== 1) errors.push("Each Legend must appear once.");
  }
  const seenMain = new Set<number>();
  for (const line of main) {
    const card = byId.get(line.cardId);
    if (seenMain.has(line.cardId)) errors.push(`Card ${line.cardId} appears on multiple main-deck lines.`);
    seenMain.add(line.cardId);
    if (!card) errors.push(`Main card ${line.cardId} is not owned.`);
    else {
      if (card.kind === "legend") errors.push(`${card.name} cannot be in the main deck.`);
      if (line.quantity < 1 || line.quantity > 3) errors.push(`${card.name} must have 1–3 copies.`);
      if (line.quantity > card.ownedQuantity) errors.push(`${card.name} recommends more copies than owned.`);
    }
  }
  const legal = validateDeck(legendIds, main);
  errors.push(...legal.errors);
  return { legal: errors.length === 0, errors, totalMain: legal.totalMain, ram: legal.ram };
}

function normalizeLegendSelection(
  candidateLegends: Array<{ cardId: number }>,
  owned: OwnedCard[],
): number[] {
  const ownedLegends = owned.filter((card) => card.kind === "legend");
  const ownedLegendIds = new Set(ownedLegends.map((card) => card.id));
  const selected = new Set<number>();
  const result: number[] = [];

  for (const line of candidateLegends) {
    if (!ownedLegendIds.has(line.cardId) || selected.has(line.cardId)) {
      continue;
    }

    selected.add(line.cardId);
    result.push(line.cardId);

    if (result.length === 3) {
      return result;
    }
  }

  for (const card of ownedLegends) {
    if (selected.has(card.id)) {
      continue;
    }

    selected.add(card.id);
    result.push(card.id);

    if (result.length === 3) {
      return result;
    }
  }

  throw new Error(
    "The advisor could not select three owned Legends for a legal deck.",
  );
}

function isMainCardLegalForLegends(
  cardId: number,
  legendIds: number[],
): boolean {
  const result = validateDeck(legendIds, [
    { cardId, quantity: 1 },
  ]);

  return !result.errors.some((error) => error.includes("RAM"));
}

function buildLegalMainDeck(
  legendIds: number[],
  candidateIds: number[],
  owned: OwnedCard[],
): AdvisorLine[] {
  const byId = ownedMap(owned);
  const selected = new Set<number>();
  const main: AdvisorLine[] = [];

  const addCard = (cardId: number) => {
    if (selected.has(cardId)) {
      return;
    }

    const card = byId.get(cardId);

    if (
      !card ||
      card.kind === "legend" ||
      card.ownedQuantity < 1 ||
      !isMainCardLegalForLegends(cardId, legendIds)
    ) {
      return;
    }

    main.push({
      cardId,
      quantity: Math.min(3, card.ownedQuantity),
    });

    selected.add(cardId);
  };

  const totalMain = () =>
    main.reduce((sum, line) => sum + line.quantity, 0);

  // First use the AI's preferred card order.
  for (const cardId of candidateIds) {
    if (totalMain() >= 40) {
      break;
    }

    addCard(cardId);
  }

  // If the AI did not provide enough usable candidates, fill
  // deterministically from the remaining owned legal cards.
  for (const card of owned) {
    if (totalMain() >= 40) {
      break;
    }

    if (card.kind === "legend") {
      continue;
    }

    addCard(card.id);
  }

  if (totalMain() < 40) {
    const ram = validateDeck(legendIds, []).ram;

    const legalOwnedCards = owned.filter(
      (card) =>
        card.kind !== "legend" &&
        card.ownedQuantity > 0 &&
        isMainCardLegalForLegends(card.id, legendIds),
    );

    const legalOwnedCopies = legalOwnedCards.reduce(
      (sum, card) => sum + Math.min(3, card.ownedQuantity),
      0,
    );

    const ownedByColor = owned
      .filter((card) => card.kind !== "legend" && card.ownedQuantity > 0)
      .reduce<Record<string, number>>((acc, card) => {
        acc[card.color] = (acc[card.color] ?? 0) + Math.min(3, card.ownedQuantity);
        return acc;
      }, {});

    const legalByColor = legalOwnedCards.reduce<Record<string, number>>(
      (acc, card) => {
        acc[card.color] = (acc[card.color] ?? 0) + Math.min(3, card.ownedQuantity);
        return acc;
      },
      {},
    );

    console.log("[advisor] deterministic builder diagnostics:", {
      legendIds,
      ram,
      ownedMainCards: owned.filter((card) => card.kind !== "legend").length,
      ownedMainCopies: owned
        .filter((card) => card.kind !== "legend")
        .reduce((sum, card) => sum + card.ownedQuantity, 0),
      legalOwnedCards: legalOwnedCards.length,
      legalOwnedCopies,
      ownedByColor,
      legalByColor,
      candidateIds,
      selectedCards: main.length,
      selectedCopies: totalMain(),
    });

    throw new Error(
      `The advisor could not build a legal 40-card main deck from the owned collection and selected Legends. ` +
      `Only ${legalOwnedCopies} legal copies are available after RAM restrictions.`,
    );
  }

  return main;
}

export async function recommendDeck(
  owned: OwnedCard[],
  goal: StrategyGoal = "midrange",
  weights: StrategyWeights = { speed: 50, control: 50, budget: 50 },
  provider?: AdvisorProvider,
): Promise<DeckRecommendation> {
  if (owned.filter((card) => card.kind === "legend").length < 3) {
    throw new Error(
      "You need at least three owned Legends before the advisor can build a legal deck.",
    );
  }

  if (
    owned
      .filter((card) => card.kind !== "legend")
      .reduce((sum, card) => sum + card.ownedQuantity, 0) < 40
  ) {
    throw new Error(
      "You need at least 40 owned main-deck cards before the advisor can build a legal deck.",
    );
  }

  const compactCards = owned.map((card) => ({
    id: card.id,
    name: card.name,
    kind: card.kind,
    color: card.color,
    ram: card.ram,
    cost: card.cost ?? null,
    power: card.power ?? null,
    marketCents: card.marketCents,
    ownedQuantity: card.ownedQuantity,
  }));

  const ownedLegends = compactCards.filter(
    (card) => card.kind === "legend",
  );
  const ownedMainCards = compactCards.filter(
    (card) => card.kind !== "legend",
  );

  const advisorPrompt = [
    `OWNED LEGENDS — choose exactly 3 unique cards from this list:`,
    JSON.stringify(ownedLegends),
    "",
    `OWNED MAIN-DECK CARDS — rank preferred cards ONLY from this list:`,
    JSON.stringify(ownedMainCards),
    "",
    `CARD-TYPE RULES:`,
    `Only cards listed under OWNED LEGENDS may appear in the Legends list.`,
    `Only cards listed under OWNED MAIN-DECK CARDS may appear in mainCandidates.`,
    `Never put a Legend in mainCandidates.`,
    "",
    `Build the strategy for one ${goal} deck using ONLY these owned cards.`,
    `Preferences: speed=${weights.speed}, control=${weights.control}, budget=${weights.budget}.`,
    `Choose exactly 3 unique Legends.`,
    `Return an ordered list of preferred main-deck card IDs in mainCandidates.`,
    `Do NOT choose quantities.`,
    `Do NOT construct the 40–50 card deck yourself.`,
    `The application will determine quantities from ownedQuantity.`,
    `The application will enforce the 40–50 card limit and maximum 3 copies.`,
    `Respect the RAM implications of the selected Legends when choosing mainCandidates.`,
    `Aggro = low-cost pressure.`,
    `Control = interaction and resilient value.`,
    `Midrange = balanced threats and answers.`,
    `Tempo = efficient threats and disruption.`,
    `Higher budget favors higher-value cards; lower budget favors lower-value cards.`,
    `Return JSON only. Do not explain the deck.`,
  ].join("\n");

  console.log(
    `[advisor] compact card payload: ${JSON.stringify(compactCards).length} chars`,
  );
  console.log(`[advisor] user prompt: ${advisorPrompt.length} chars`);

  const systemPrompt =
    `You are a Cyberpunk TCG deck-building advisor. ` +
    `Select strategic card choices from the supplied owned cards. ` +
    `The application, not you, constructs the final legal deck. ` +
    `Return only the requested JSON structure. ` +
    `Do not include explanations or extra text.`;

  const responseFormat = {
    type: "json_schema" as const,
    json_schema: {
      name: "cyberpunk_deck_recommendation",
      strict: true,
      schema: recommendationSchema,
    },
  };

  const response = await invokeLLM({
    provider,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: advisorPrompt,
      },
    ],
    maxTokens: 5000,
    response_format: responseFormat,
  });

  const raw = contentText(response.choices?.[0]?.message?.content);

  let aiRecommendation: {
    name: string;
    strategy: string;
    legends: Array<{ cardId: number }>;
    mainCandidates: Array<{ cardId: number }>;
  };

  try {
    aiRecommendation = JSON.parse(raw);
  } catch {
    throw new Error(
      "The AI advisor returned an unreadable deck recommendation. Please try again.",
    );
  }

  const legendIds = normalizeLegendSelection(
    aiRecommendation.legends,
    owned,
  );

  const main = buildLegalMainDeck(
    legendIds,
    aiRecommendation.mainCandidates.map((candidate) => candidate.cardId),
    owned,
  );

  const byId = ownedMap(owned);

  const recommendation: DeckRecommendation = {
    name: aiRecommendation.name,
    strategy: aiRecommendation.strategy,
    summary: `${goal} build generated from your owned collection.`,
    whyLegends: legendIds
      .map((cardId) => byId.get(cardId)?.name)
      .filter((name): name is string => Boolean(name))
      .map(
        (name) =>
          `${name} selected as part of the ${goal} strategy.`,
      ),
    legends: legendIds.map((cardId) => ({
      cardId,
      quantity: 1,
    })),
    main,
    upgradeSuggestions: [],
    totalMain: main.reduce(
      (sum, line) => sum + line.quantity,
      0,
    ),
  };

  const validation = validateRecommendation(
    recommendation,
    owned,
  );

  if (!validation.legal) {
    throw new Error(
      `The advisor returned an illegal deck: ${validation.errors
        .slice(0, 3)
        .join(" ")}`,
    );
  }

  return recommendation;
}

export function recommendationDeckKey(
  recommendation: DeckRecommendation,
): string {
  const legends = [...recommendation.legends]
    .sort((a, b) => a.cardId - b.cardId)
    .map((line) => `${line.cardId}:${line.quantity}`)
    .join(",");

  const main = [...recommendation.main]
    .sort((a, b) => a.cardId - b.cardId)
    .map((line) => `${line.cardId}:${line.quantity}`)
    .join(",");

  return `legends=${legends}|main=${main}`;
}

export function deduplicateRecommendations(
  recommendations: DeckRecommendation[],
): DeckRecommendation[] {
  const seen = new Set<string>();

  return recommendations.filter((recommendation) => {
    const key = recommendationDeckKey(recommendation);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function recommendDecks(
  owned: OwnedCard[],
  goals: StrategyGoal[],
  weights: StrategyWeights,
  provider?: AdvisorProvider,
) {
  const recommendations: DeckRecommendation[] = [];

  for (const goal of goals) {
    recommendations.push(
      await recommendDeck(owned, goal, weights, provider),
    );
  }

  return deduplicateRecommendations(recommendations);
}

export function ownedCatalogRows(collection: Array<{ cardId: number; quantity: number }>, cards = FULL_CATALOG) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return collection.map((item) => { const card = byId.get(item.cardId); return card && item.quantity > 0 ? { ...card, ownedQuantity: item.quantity } : undefined; }).filter((card): card is OwnedCard => Boolean(card));
}
