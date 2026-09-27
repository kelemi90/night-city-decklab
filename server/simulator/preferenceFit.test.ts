import { describe, expect, it } from "vitest";

import type { CatalogCard } from "../../shared/deckRules";
import type { DeckRecommendation } from "../deckAdvisor";
import {
  calculatePreferenceFit,
  scoreCardControl,
  scoreCardSpeed,
  type PreferenceCard,
} from "./preferenceFit";

function card(
  id: number,
  overrides: Partial<PreferenceCard> = {},
): PreferenceCard {
  return {
    id,
    name: `Card ${id}`,
    kind: "unit",
    color: "red",
    cost: 5,
    power: 3,
    ram: 3,
    rarity: "Common",
    setName: "Test",
    marketCents: 1000,
    sourceUrl: "",
    imageUrl: "",
    rulesText: "",
    ...overrides,
  };
}

function recommendation(
  main: DeckRecommendation["main"],
): DeckRecommendation {
  return {
    name: "Test Deck",
    strategy: "Test",
    summary: "Test",
    whyLegends: [],
    legends: [],
    main,
    upgradeSuggestions: [],
    totalMain: main.reduce(
      (sum, line) => sum + line.quantity,
      0,
    ),
  };
}

describe("preference fit", () => {
  it("scores Adrenaline as a speed signal", () => {
    const slow = card(1, {
      cost: 8,
    });

    const fast = card(2, {
      cost: 2,
      rulesText:
        "{Adrenaline} (This Unit can attack the turn it's played.)",
    });

    expect(scoreCardSpeed(fast, [slow, fast]))
      .toBeGreaterThan(scoreCardSpeed(slow, [slow, fast]));
  });

  it("scores immediate attack effects as speed signals", () => {
    const normal = card(1, {
      cost: 4,
    });

    const immediate = card(2, {
      cost: 4,
      rulesText:
        "{Play} This Unit can attack rival Units this turn.",
    });

    expect(scoreCardSpeed(immediate, [normal, immediate]))
      .toBeGreaterThan(scoreCardSpeed(normal, [normal, immediate]));
  });

  it("scores Blocker as a strong control signal", () => {
    const normal = card(1);
    const blocker = card(2, {
      rulesText:
        "{Blocker} (You may spend this Unit to redirect a rival Unit's attack to it instead.)",
    });

    expect(scoreCardControl(blocker))
      .toBeGreaterThan(scoreCardControl(normal));
  });

  it("scores rival-unit removal as a strong control signal", () => {
    const normal = card(1);
    const removal = card(2, {
      rulesText:
        "{Play} Defeat a rival Unit with power 3 or less.",
    });

    expect(scoreCardControl(removal))
      .toBeGreaterThan(scoreCardControl(normal));
  });

  it("does not treat generic card draw as control", () => {
    const draw = card(1, {
      rulesText: "{Play} Draw 2.",
    });

    expect(scoreCardControl(draw)).toBe(0);
  });

  it("respects low-budget preference", () => {
    const cheap = card(1, {
      marketCents: 100,
    });

    const expensive = card(2, {
      marketCents: 10000,
    });

    const result = calculatePreferenceFit(
      recommendation([
        { cardId: 1, quantity: 1 },
      ]),
      [cheap, expensive],
      {
        speed: 0,
        control: 0,
        budget: 100,
      },
    );

    expect(result.budget).toBe(0);
  });

  it("respects high-budget preference", () => {
    const cheap = card(1, {
      marketCents: 100,
    });

    const expensive = card(2, {
      marketCents: 10000,
    });

    const result = calculatePreferenceFit(
      recommendation([
        { cardId: 2, quantity: 1 },
      ]),
      [cheap, expensive],
      {
        speed: 0,
        control: 0,
        budget: 100,
      },
    );

    expect(result.budget).toBe(100);
  });

  it("combines weighted preference dimensions", () => {
    const fast = card(1, {
      cost: 1,
      rulesText:
        "{Adrenaline} (This Unit can attack the turn it's played.)",
      marketCents: 100,
    });

    const control = card(2, {
      cost: 8,
      rulesText:
        "{Blocker} {Play} Defeat a rival Unit.",
      marketCents: 10000,
    });

    const result = calculatePreferenceFit(
      recommendation([
        { cardId: 1, quantity: 1 },
      ]),
      [fast, control],
      {
        speed: 100,
        control: 0,
        budget: 0,
      },
    );

    expect(result.weighted).toBe(result.speed);
    expect(result.speed).toBeGreaterThan(50);
  });

  it("handles zero total weights safely", () => {
    const result = calculatePreferenceFit(
      recommendation([
        { cardId: 1, quantity: 1 },
      ]),
      [card(1)],
      {
        speed: 0,
        control: 0,
        budget: 0,
      },
    );

    expect(result.weighted).toBe(50);
  });
});
