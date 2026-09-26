import { invokeLLM } from "./_core/llm";
import { FULL_CATALOG, validateDeck, type CatalogCard } from "../shared/deckRules";

type OwnedCard = CatalogCard & { ownedQuantity: number };
export type StrategyGoal = "aggro" | "control" | "midrange" | "tempo";
export type StrategyWeights = { speed: number; control: number; budget: number };
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
    summary: { type: "string" },
    whyLegends: { type: "array", items: { type: "string" } },
    legends: { type: "array", items: { type: "object", properties: { cardId: { type: "integer" }, quantity: { type: "integer" } }, required: ["cardId", "quantity"], additionalProperties: false } },
    main: { type: "array", items: { type: "object", properties: { cardId: { type: "integer" }, quantity: { type: "integer" } }, required: ["cardId", "quantity"], additionalProperties: false } },
    upgradeSuggestions: { type: "array", items: { type: "string" } },
  },
  required: ["name", "strategy", "summary", "whyLegends", "legends", "main", "upgradeSuggestions"],
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

export async function recommendDeck(owned: OwnedCard[], goal: StrategyGoal = "midrange", weights: StrategyWeights = { speed: 50, control: 50, budget: 50 }): Promise<DeckRecommendation> {
  if (owned.filter((card) => card.kind === "legend").length < 3) throw new Error("You need at least three owned Legends before the advisor can build a legal deck.");
  if (owned.filter((card) => card.kind !== "legend").reduce((sum, card) => sum + card.ownedQuantity, 0) < 40) throw new Error("You need at least 40 owned main-deck cards before the advisor can build a legal deck.");
  const compactCards = owned.map((card) => ({ id: card.id, name: card.name, subtitle: card.subtitle, kind: card.kind, color: card.color, ram: card.ram, cost: card.cost ?? null, power: card.power ?? null, ownedQuantity: card.ownedQuantity }));
  const response = await invokeLLM({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: `You are a Cyberpunk TCG deck-building advisor. Recommend exactly one legal ${goal} deck using only the owned cards in the user payload. Follow these hard rules: exactly 3 unique Legends; 40–50 main-deck cards; maximum 3 copies of a card; never put Legends in the main deck; never exceed ownedQuantity; each main card's RAM must not exceed the RAM ceiling supplied by the three Legends for its color. Strategy guidance: aggro favors low-cost pressure and efficient power; control favors interaction, defensive value, and a slower curve; midrange balances threats and answers; tempo favors efficient threats and flexible disruption. Return JSON only.` },
      { role: "user", content: `Owned Cyberpunk TCG cards:\n${JSON.stringify(compactCards)}\n\nBuild the strongest coherent ${goal} deck with these weighted preferences from 0 to 100: speed=${weights.speed}, control=${weights.control}, budget=${weights.budget}. Higher speed favors lower curves and early pressure; higher control favors answers and resilient value; higher budget favors stronger/high-market-value cards, while lower budget favors cards with lower market value. Set the strategy field to describe the actual plan. Include brief reasoning and practical upgrade suggestions, but every recommended card line must use an owned id.` },
    ],
    maxTokens: 2200,
    response_format: { type: "json_schema", json_schema: { name: "cyberpunk_deck_recommendation", strict: true, schema: recommendationSchema } },
    reasoning: { effort: "low" },
  });
  const raw = contentText(response.choices?.[0]?.message?.content);
  let recommendation: DeckRecommendation;
  try { recommendation = JSON.parse(raw) as DeckRecommendation; } catch { throw new Error("The AI advisor returned an unreadable deck recommendation. Please try again."); }
  const validation = validateRecommendation(recommendation, owned);
  if (!validation.legal) throw new Error(`The advisor returned an illegal deck: ${validation.errors.slice(0, 3).join(" ")}`);
  return { ...recommendation, totalMain: validation.totalMain };
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
) {
  const recommendations = await Promise.all(
    goals.map((goal) => recommendDeck(owned, goal, weights)),
  );

  return deduplicateRecommendations(recommendations);
}

export function ownedCatalogRows(collection: Array<{ cardId: number; quantity: number }>, cards = FULL_CATALOG) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return collection.map((item) => { const card = byId.get(item.cardId); return card && item.quantity > 0 ? { ...card, ownedQuantity: item.quantity } : undefined; }).filter((card): card is OwnedCard => Boolean(card));
}
