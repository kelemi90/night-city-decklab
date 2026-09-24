import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CatalogCard } from "../../shared/deckRules";
import type { SimulatorCard } from "./types";

export type CardDetails = {
  cardId: number;
  rulesText: string;
  flavorText?: string | null;
  classifications?: string[];
  keywords?: string[];
  cardType?: string;
  artist?: string;
};

type DetailsMap = Record<string, CardDetails>;

const DETAILS_PATH = path.resolve(
  process.cwd(),
  "client/public/card-art/details.json",
);

let detailsCache: DetailsMap | undefined;

async function loadDetails(): Promise<DetailsMap> {
  if (detailsCache) {
    return detailsCache;
  }

  const raw = await readFile(DETAILS_PATH, "utf8");
  detailsCache = JSON.parse(raw) as DetailsMap;

  return detailsCache;
}

function hasRuleTag(rulesText: string, tag: string): boolean {
  return new RegExp(`\\{${tag}\\}`, "i").test(rulesText);
}

export function catalogCardToSimulatorCard(
  card: CatalogCard,
  details?: CardDetails,
): SimulatorCard {
  const rulesText = details?.rulesText ?? "";

  return {
    id: card.id,
    name: card.name,
    kind: card.kind,
    color: card.color,
    cost: card.cost,
    power: card.power,
    ram: card.ram,
    rulesText,

    sellable: hasRuleTag(rulesText, "Sell"),
    blocker: hasRuleTag(rulesText, "Blocker"),
    adrenaline: hasRuleTag(rulesText, "Adrenaline"),
  };
}

export async function loadSimulatorCard(
  card: CatalogCard,
): Promise<SimulatorCard> {
  const details = await loadDetails();

  return catalogCardToSimulatorCard(
    card,
    details[String(card.id)],
  );
}

export async function loadSimulatorCards(
  cards: CatalogCard[],
): Promise<SimulatorCard[]> {
  const details = await loadDetails();

  return cards.map((card) =>
    catalogCardToSimulatorCard(
      card,
      details[String(card.id)],
    ),
  );
}

export async function loadSimulatorCatalog(
  cards: CatalogCard[],
): Promise<SimulatorCard[]> {
  return loadSimulatorCards(cards);
}
