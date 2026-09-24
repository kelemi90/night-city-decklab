import { describe, expect, it } from "vitest";

import { FULL_CATALOG } from "../../shared/deckRules";
import {
  catalogCardToSimulatorCard,
  loadSimulatorCatalog,
} from "./cardAdapter";

describe("Cyberpunk TCG card adapter", () => {
  it("maps the complete catalog", async () => {
    const cards = await loadSimulatorCatalog(FULL_CATALOG);

    expect(cards).toHaveLength(369);
    expect(cards.every((card) => card.rulesText !== undefined)).toBe(true);
  });

  it("preserves catalog identity", async () => {
    const cards = await loadSimulatorCatalog(FULL_CATALOG);

    expect(cards.map((card) => card.id)).toEqual(
      FULL_CATALOG.map((card) => card.id),
    );
  });

  it("detects all official Blocker cards", async () => {
    const cards = await loadSimulatorCatalog(FULL_CATALOG);

    expect(cards.filter((card) => card.blocker)).toHaveLength(31);
  });

  it("detects all Adrenaline cards", async () => {
    const cards = await loadSimulatorCatalog(FULL_CATALOG);

    expect(cards.filter((card) => card.adrenaline)).toHaveLength(8);
  });

  it("detects known Adrenaline cards", async () => {
    const cards = await loadSimulatorCatalog(FULL_CATALOG);
    const byId = new Map(cards.map((card) => [card.id, card]));

    for (const id of [66, 88, 94, 137, 227, 253, 258, 308]) {
      expect(byId.get(id)?.adrenaline).toBe(true);
    }
  });

  it("does not confuse a Sell effect with the Sell tag", async () => {
    const cards = await loadSimulatorCatalog(FULL_CATALOG);

    const bootlegCards = cards.filter(
      (card) => card.name === "Bootleg Black Sapphire Show",
    );

    expect(bootlegCards).toHaveLength(2);
    expect(bootlegCards.every((card) => card.sellable !== true)).toBe(true);
  });

  it("preserves Rebecca's empty rules text", async () => {
    const cards = await loadSimulatorCatalog(FULL_CATALOG);

    const rebecca = cards.find((card) => card.id === 6);

    expect(rebecca).toBeDefined();
    expect(rebecca?.rulesText).toBe("");
  });

  it("can derive capabilities from standalone card details", () => {
    const card = FULL_CATALOG.find(
      (item) => item.id === 76,
    );

    expect(card).toBeDefined();

    const simulatorCard = catalogCardToSimulatorCard(card!, {
      cardId: 76,
      rulesText:
        "{Go Solo} Pay this Legend's cost.\n{Blocker}",
    });

    expect(simulatorCard.blocker).toBe(true);
    expect(simulatorCard.adrenaline).toBe(false);
    expect(simulatorCard.sellable).toBe(false);
    expect(simulatorCard.rulesText).toContain("{Blocker}");
  });
});
