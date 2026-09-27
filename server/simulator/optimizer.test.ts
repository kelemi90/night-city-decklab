import { describe, expect, it } from "vitest";

import type { DeckRecommendation } from "../deckAdvisor";
import type { SimulatorCard } from "./types";
import {
  compareCandidates,
  evaluateDeckCandidate,
  optimizeDeckCandidates,
} from "./optimizer";

const unit: SimulatorCard = {
  id: 1,
  name: "Test Unit",
  kind: "unit",
  color: "red",
  cost: 1,
  power: 1,
  ram: 1,
};

const legends: SimulatorCard[] = [
  {
    id: 100,
    name: "Test Legend A",
    kind: "legend",
    color: "red",
    ram: 1,
  },
  {
    id: 101,
    name: "Test Legend B",
    kind: "legend",
    color: "red",
    ram: 1,
  },
  {
    id: 102,
    name: "Test Legend C",
    kind: "legend",
    color: "red",
    ram: 1,
  },
];

function createRecommendation(
  name: string,
): DeckRecommendation {
  return {
    name,
    strategy: "test",
    summary: "Test recommendation",
    whyLegends: [
      "Legend A",
      "Legend B",
      "Legend C",
    ],
    legends: [
      { cardId: 100, quantity: 1 },
      { cardId: 101, quantity: 1 },
      { cardId: 102, quantity: 1 },
    ],
    main: [
      { cardId: 1, quantity: 40 },
    ],
    upgradeSuggestions: [],
    totalMain: 40,
  };
}

const catalog = [
  {
    id: 1,
    name: "Test Unit",
    kind: "unit" as const,
    color: "red",
    ram: 1,
    cost: 1,
    power: 1,
    ownedQuantity: 40,
  },
  ...legends.map((card) => ({
    ...card,
    ownedQuantity: 1,
  })),
];

const opponent = {
  cards: Array.from({ length: 40 }, () => ({
    ...unit,
  })),
  legends: legends.map((legend) => ({
    ...legend,
  })),
};

function createEvaluatedCandidate(
  name: string,
  {
    winRate = 0.5,
    unfinishedGames = 0,
    averageTurns = 10,
  }: {
    winRate?: number;
    unfinishedGames?: number;
    averageTurns?: number;
  } = {},
) {
  return {
    recommendation: createRecommendation(name),
    deck: {
      cards: Array.from({ length: 40 }, () => ({ ...unit })),
      legends: legends.map((legend) => ({ ...legend })),
    },
    evaluation: {
      gamesPerSide: 5,
      candidateFirst: {
        deck: "candidate" as const,
        firstPlayer: 0 as const,
        games: 5,
        wins: 3,
        losses: 2,
        unfinishedGames: 0,
        winRate: 0.6,
        averageTurns,
        averageAttacks: 0,
        averageGigSteals: 0,
        averageCardsPlayed: 0,
        averageUnitsDefeated: 0,
      },
      candidateSecond: {
        deck: "candidate" as const,
        firstPlayer: 1 as const,
        games: 5,
        wins: 2,
        losses: 3,
        unfinishedGames: 0,
        winRate: 0.4,
        averageTurns,
        averageAttacks: 0,
        averageGigSteals: 0,
        averageCardsPlayed: 0,
        averageUnitsDefeated: 0,
      },
      overall: {
        games: 10,
        wins: Math.round(winRate * 10),
        losses: 10 - Math.round(winRate * 10) - unfinishedGames,
        unfinishedGames,
        winRate,
      },
      averageTurns,
      averageAttacks: 0,
      averageGigSteals: 0,
      averageCardsPlayed: 0,
      averageUnitsDefeated: 0,
    },
    matchups: [],
  };
}

describe("Cyberpunk TCG deck optimizer", () => {
  it("ranks higher simulation win rate first", () => {
    const higherWinRate = createEvaluatedCandidate(
      "Higher Win Rate",
      {
        winRate: 0.7,
        unfinishedGames: 3,
        averageTurns: 20,
      },
    );

    const lowerWinRate = createEvaluatedCandidate(
      "Lower Win Rate",
      {
        winRate: 0.6,
        unfinishedGames: 0,
        averageTurns: 5,
      },
    );

    expect(
      compareCandidates(
        higherWinRate,
        lowerWinRate,
      ),
    ).toBeLessThan(0);
  });

  it("uses unfinished games as the first tie-breaker", () => {
    const fewerUnfinished = createEvaluatedCandidate(
      "Fewer Unfinished",
      {
        winRate: 0.6,
        unfinishedGames: 1,
        averageTurns: 20,
      },
    );

    const moreUnfinished = createEvaluatedCandidate(
      "More Unfinished",
      {
        winRate: 0.6,
        unfinishedGames: 2,
        averageTurns: 5,
      },
    );

    expect(
      compareCandidates(
        fewerUnfinished,
        moreUnfinished,
      ),
    ).toBeLessThan(0);
  });

  it("uses average turns as the final tie-breaker", () => {
    const fewerTurns = createEvaluatedCandidate(
      "Fewer Turns",
      {
        winRate: 0.6,
        unfinishedGames: 1,
        averageTurns: 8,
      },
    );

    const moreTurns = createEvaluatedCandidate(
      "More Turns",
      {
        winRate: 0.6,
        unfinishedGames: 1,
        averageTurns: 12,
      },
    );

    expect(
      compareCandidates(
        fewerTurns,
        moreTurns,
      ),
    ).toBeLessThan(0);
  });
  it("evaluates a recommendation through the simulator", async () => {
    const result = await evaluateDeckCandidate(
      createRecommendation("Test Deck"),
      opponent,
      catalog,
      {
        gamesPerSide: 5,
        seed: 12345,
        maxTurns: 200,
      },
    );

    expect(result.recommendation.name).toBe(
      "Test Deck",
    );

    expect(result.evaluation.overall.games).toBe(10);

    expect(
      result.evaluation.candidateFirst.games,
    ).toBe(5);

    expect(
      result.evaluation.candidateSecond.games,
    ).toBe(5);

    expect(
      result.evaluation.overall.winRate,
    ).toBeGreaterThanOrEqual(0);

    expect(
      result.evaluation.overall.winRate,
    ).toBeLessThanOrEqual(1);
  });

  it("rejects an empty candidate list", async () => {
    await expect(
      optimizeDeckCandidates(
        [],
        catalog,
        {
          gamesPerSide: 5,
        },
      ),
    ).rejects.toThrow(
      "Cannot optimize an empty list of deck candidates.",
    );
  });

  it("runs every candidate against every other candidate", async () => {
    const recommendations = [
      createRecommendation("Deck A"),
      createRecommendation("Deck B"),
      createRecommendation("Deck C"),
    ];

    const result = await optimizeDeckCandidates(
      recommendations,
      catalog,
      {
        gamesPerSide: 5,
        seed: 1000,
        maxTurns: 200,
      },
    );

    expect(result.candidates).toHaveLength(3);

    expect(
      result.candidates.map(
        (candidate) => candidate.recommendation.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "Deck A",
        "Deck B",
        "Deck C",
      ]),
    );

    /*
     * 3 candidates produce one simulation for each
     * unordered pair:
     *
     * A vs B
     * A vs C
     * B vs C
     *
     * Each evaluateDeckMatchup() call contains:
     * 5 games with the first candidate going first
     * 5 games with the first candidate going second.
     *
     * The same matchup result is then perspective-swapped
     * and aggregated into the opponent's tournament record.
     *
     * Therefore each candidate participates in:
     * 2 opponents * 10 games = 20 games.
     */
    for (const candidate of result.candidates) {
      expect(
        candidate.evaluation.overall.games,
      ).toBe(20);

      expect(
        candidate.evaluation.candidateFirst.games,
      ).toBe(10);

      expect(
        candidate.evaluation.candidateSecond.games,
      ).toBe(10);

      expect(candidate.matchups).toHaveLength(2);

      const expectedOpponents = [
        "Deck A",
        "Deck B",
        "Deck C",
      ].filter(
        (name) =>
          name !== candidate.recommendation.name,
      );

      expect(
        candidate.matchups.map(
          (matchup) => matchup.opponent.name,
        ),
      ).toEqual(
        expect.arrayContaining(expectedOpponents),
      );

      for (const matchup of candidate.matchups) {
        expect(
          matchup.opponent.name,
        ).not.toBe(candidate.recommendation.name);

        expect(
          matchup.evaluation.overall.games,
        ).toBe(10);

        expect(
          matchup.evaluation.candidateFirst.games,
        ).toBe(5);

        expect(
          matchup.evaluation.candidateSecond.games,
        ).toBe(5);
      }
    }

    expect(result.winner).toBe(
      result.candidates[0],
    );

    for (let index = 1; index < result.candidates.length; index += 1) {
      const previous = result.candidates[index - 1].evaluation;
      const current = result.candidates[index].evaluation;

      expect(
        previous.overall.winRate,
      ).toBeGreaterThanOrEqual(
        current.overall.winRate,
      );

      if (
        previous.overall.winRate ===
        current.overall.winRate
      ) {
        expect(
          previous.overall.unfinishedGames,
        ).toBeLessThanOrEqual(
          current.overall.unfinishedGames,
        );

        if (
          previous.overall.unfinishedGames ===
          current.overall.unfinishedGames
        ) {
          expect(
            previous.averageTurns,
          ).toBeLessThanOrEqual(
            current.averageTurns,
          );
        }
      }
    }
  });

  it("does not simulate a candidate against itself", async () => {
    const recommendations = [
      createRecommendation("Deck A"),
      createRecommendation("Deck B"),
    ];

    const result = await optimizeDeckCandidates(
      recommendations,
      catalog,
      {
        gamesPerSide: 3,
        seed: 2000,
        maxTurns: 200,
      },
    );

    /*
     * Two candidates have exactly one unordered matchup.
     * The single evaluateDeckMatchup() call contains
     * 3 games with each candidate going first.
     */
    expect(
      result.candidates[0].evaluation.overall.games,
    ).toBe(6);

    expect(
      result.candidates[1].evaluation.overall.games,
    ).toBe(6);

    expect(
      result.candidates[0].evaluation.candidateFirst.games,
    ).toBe(3);

    expect(
      result.candidates[0].evaluation.candidateSecond.games,
    ).toBe(3);
  });
});
