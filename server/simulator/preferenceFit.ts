import type { CatalogCard } from "../../shared/deckRules";
import type {
  DeckRecommendation,
  StrategyWeights,
} from "../deckAdvisor";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type PreferenceDetails = {
  cardId: number;
  rulesText: string;
};

export type PreferenceFit = {
  speed: number;
  control: number;
  budget: number;
  weighted: number;
};

export type PreferenceCard = CatalogCard & {
  rulesText: string;
};

const DETAILS_PATH = path.resolve(
  process.cwd(),
  "client/public/card-art/details.json",
);

type PreferenceDetailsMap = Record<
  string,
  PreferenceDetails
>;

let preferenceDetailsCache:
  | PreferenceDetailsMap
  | undefined;

async function loadPreferenceDetails(): Promise<PreferenceDetailsMap> {
  if (preferenceDetailsCache) {
    return preferenceDetailsCache;
  }

  const raw = await readFile(DETAILS_PATH, "utf8");

  preferenceDetailsCache =
    JSON.parse(raw) as PreferenceDetailsMap;

  return preferenceDetailsCache;
}

export async function loadPreferenceCatalog(
  catalog: CatalogCard[],
): Promise<PreferenceCard[]> {
  const details = await loadPreferenceDetails();

  return catalog.map((card) => ({
    ...card,
    rulesText: details[String(card.id)]?.rulesText ?? "",
  }));
}

const DEFAULT_WEIGHTS: StrategyWeights = {
  speed: 50,
  control: 50,
  budget: 50,
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function normalized(value: number, min: number, max: number): number {
  if (max <= min) {
    return 50;
  }

  return clamp(((value - min) / (max - min)) * 100);
}

function hasTag(rulesText: string, tag: string): boolean {
  return new RegExp(`\\{${tag}\\}`, "i").test(rulesText);
}

function hasAny(rulesText: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(rulesText));
}

/**
 * Returns a 0-100 speed signal for one card.
 *
 * Speed intentionally combines curve and explicit immediate-pressure
 * mechanics instead of treating every {Attack} tag as equally aggressive.
 */
export function scoreCardSpeed(
  card: PreferenceCard,
  catalog: PreferenceCard[],
): number {
  const costs = catalog
    .map((candidate) => candidate.cost)
    .filter((cost): cost is number => cost !== undefined);

  const minCost = costs.length ? Math.min(...costs) : 0;
  const maxCost = costs.length ? Math.max(...costs) : 1;

  const curveScore =
    card.cost === undefined
      ? 50
      : 100 - normalized(card.cost, minCost, maxCost);

  let effectScore = 0;

  if (hasTag(card.rulesText, "Adrenaline")) {
    effectScore += 30;
  }

  if (
    hasAny(card.rulesText, [
      /can attack (?:rival (?:Units?|Legends?)|this turn|the turn it's played)/i,
      /ready Unit/i,
    ])
  ) {
    effectScore += 30;
  }

  if (hasTag(card.rulesText, "Go Solo")) {
    effectScore += 15;
  }

  if (hasTag(card.rulesText, "Attack")) {
    effectScore += 10;
  }

  return clamp(curveScore * 0.6 + clamp(effectScore) * 0.4);
}

/**
 * Returns a 0-100 control signal for one card.
 *
 * The score is based on concrete defensive/disruptive effects in
 * the official rules text rather than simulation statistics.
 */
export function scoreCardControl(card: PreferenceCard): number {
  let score = 0;
  const rules = card.rulesText;

  if (hasTag(rules, "Blocker")) {
    score += 35;
  }

  if (
    /defeat a rival (?:Unit|Gear)/i.test(rules) ||
    /defeat all other Units/i.test(rules)
  ) {
    score += 35;
  }

  if (/spend a rival Unit/i.test(rules)) {
    score += 25;
  }

  if (
    /rival Unit (?:can't|cannot) (?:ready|attack)/i.test(rules) ||
    /A Unit can't attack until your next turn/i.test(rules)
  ) {
    score += 25;
  }

  if (
    /rival Unit (?:loses|has -|with cost)/i.test(rules) ||
    /Give a rival Unit -/i.test(rules)
  ) {
    score += 20;
  }

  if (
    /can't be defeated/i.test(rules) ||
    /doesn't defeat the opposing friendly Unit/i.test(rules)
  ) {
    score += 20;
  }

  if (/Rival (?:discards|must attack)/i.test(rules)) {
    score += 15;
  }

  if (
    /rival Units? can't steal/i.test(rules) ||
    /rival Legends can't steal/i.test(rules) ||
    /steals 1 fewer Gig/i.test(rules)
  ) {
    score += 15;
  }

  if (/Decrease a Gig|Swap a friendly Gig with a rival Gig/i.test(rules)) {
    score += 10;
  }

  return clamp(score);
}

/**
 * Calculates the market-value signal for the entire recommendation.
 *
 * The catalog's current market-value range provides the reference
 * frame. Higher weights favor expensive cards; lower weights favor
 * cheaper cards.
 */
export function scoreBudgetFit(
  cards: PreferenceCard[],
  catalog: PreferenceCard[],
  weights: StrategyWeights,
): number {
  if (!cards.length || !catalog.length) {
    return 50;
  }

  const catalogPrices = catalog.map((card) =>
    Math.max(0, card.marketCents),
  );

  const minPrice = Math.min(...catalogPrices);
  const maxPrice = Math.max(...catalogPrices);

  const averagePrice =
    cards.reduce(
      (sum, card) => sum + Math.max(0, card.marketCents),
      0,
    ) / cards.length;

  const priceProfile = normalized(
    averagePrice,
    minPrice,
    maxPrice,
  );

  return clamp(
    100 - Math.abs(priceProfile - weights.budget),
  );
}

function collectRecommendationCards(
  recommendation: DeckRecommendation,
  catalog: PreferenceCard[],
): PreferenceCard[] {
  const byId = new Map(
    catalog.map((card) => [card.id, card]),
  );

  const lines = [
    ...recommendation.legends,
    ...recommendation.main,
  ];

  const cards: PreferenceCard[] = [];

  for (const line of lines) {
    const card = byId.get(line.cardId);

    if (!card) {
      continue;
    }

    for (let i = 0; i < line.quantity; i += 1) {
      cards.push(card);
    }
  }

  return cards;
}

export function calculatePreferenceFit(
  recommendation: DeckRecommendation,
  catalog: PreferenceCard[],
  weights: StrategyWeights = DEFAULT_WEIGHTS,
): PreferenceFit {
  const cards = collectRecommendationCards(
    recommendation,
    catalog,
  );

  if (!cards.length) {
    return {
      speed: 50,
      control: 50,
      budget: 50,
      weighted: 50,
    };
  }

  const speed =
    cards.reduce(
      (sum, card) => sum + scoreCardSpeed(card, catalog),
      0,
    ) / cards.length;

  const control =
    cards.reduce(
      (sum, card) => sum + scoreCardControl(card),
      0,
    ) / cards.length;

  const budget = scoreBudgetFit(
    cards,
    catalog,
    weights,
  );

  const totalWeight =
    weights.speed +
    weights.control +
    weights.budget;

  const weighted =
    totalWeight > 0
      ? (
          speed * weights.speed +
          control * weights.control +
          budget * weights.budget
        ) / totalWeight
      : 50;

  return {
    speed: clamp(speed),
    control: clamp(control),
    budget: clamp(budget),
    weighted: clamp(weighted),
  };
}

export function attachPreferenceDetails(
  catalog: CatalogCard[],
  details: PreferenceDetails[],
): PreferenceCard[] {
  const byId = new Map(
    details.map((detail) => [
      detail.cardId,
      detail.rulesText,
    ]),
  );

  return catalog.map((card) => ({
    ...card,
    rulesText: byId.get(card.id) ?? "",
  }));
}
