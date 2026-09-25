import type { CatalogCard } from "../../shared/deckRules";
import type { DeckRecommendation } from "../deckAdvisor";
import {
  loadSimulatorCards,
} from "./cardAdapter";
import type { SimulatorCard } from "./types";

export type SimulatorDeck = {
  legends: SimulatorCard[];
  main: SimulatorCard[];
};

function expandLines(
  lines: Array<{ cardId: number; quantity: number }>,
  cards: Map<number, SimulatorCard>,
): SimulatorCard[] {
  const result: SimulatorCard[] = [];

  for (const line of lines) {
    const card = cards.get(line.cardId);

    if (!card) {
      throw new Error(
        `Card ${line.cardId} could not be converted to a simulator card.`,
      );
    }

    for (let copy = 0; copy < line.quantity; copy += 1) {
      result.push({
        ...card,
      });
    }
  }

  return result;
}

export async function recommendationToSimulatorDeck(
  recommendation: DeckRecommendation,
  catalog: CatalogCard[],
): Promise<SimulatorDeck> {
  const simulatorCards = await loadSimulatorCards(catalog);

  const byId = new Map(
    simulatorCards.map((card) => [card.id, card]),
  );

  return {
    legends: expandLines(
      recommendation.legends,
      byId,
    ),
    main: expandLines(
      recommendation.main,
      byId,
    ),
  };
}
