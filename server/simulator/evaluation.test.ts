import { describe, expect, it } from "vitest";

import type { BatchSimulationResult } from "./simulation";
import {
  evaluateBatch,
  evaluateDeckMatchup,
  evaluatePlayer,
} from "./evaluation";

function createResult(): BatchSimulationResult {
  return {
    games: 100,

    player0Wins: 60,
    player1Wins: 30,
    unfinishedGames: 10,

    player0WinRate: 0.6,
    player1WinRate: 0.3,

    averageTurns: 12.5,

    totalAttacks: [400, 300],
    totalGigSteals: [180, 120],
    totalCardsPlayed: [500, 450],
    totalUnitsDefeated: [90, 70],
  };
}

describe("Cyberpunk TCG simulator evaluation", () => {
  it("evaluates Player 0 correctly", () => {
    const evaluation = evaluatePlayer(
      createResult(),
      0,
    );

    expect(evaluation.playerId).toBe(0);

    expect(evaluation.score).toBe(0.6);
    expect(evaluation.winRate).toBe(0.6);

    expect(evaluation.games).toBe(100);
    expect(evaluation.wins).toBe(60);
    expect(evaluation.losses).toBe(30);
    expect(evaluation.unfinishedGames).toBe(10);

    expect(evaluation.averageTurns).toBe(12.5);
    expect(evaluation.averageAttacks).toBe(4);
    expect(evaluation.averageGigSteals).toBe(1.8);
    expect(evaluation.averageCardsPlayed).toBe(5);
    expect(evaluation.averageUnitsDefeated).toBe(0.9);
  });

  it("evaluates Player 1 correctly", () => {
    const evaluation = evaluatePlayer(
      createResult(),
      1,
    );

    expect(evaluation.playerId).toBe(1);

    expect(evaluation.score).toBe(0.3);
    expect(evaluation.winRate).toBe(0.3);

    expect(evaluation.games).toBe(100);
    expect(evaluation.wins).toBe(30);
    expect(evaluation.losses).toBe(60);
    expect(evaluation.unfinishedGames).toBe(10);

    expect(evaluation.averageAttacks).toBe(3);
    expect(evaluation.averageGigSteals).toBe(1.2);
    expect(evaluation.averageCardsPlayed).toBe(4.5);
    expect(evaluation.averageUnitsDefeated).toBe(0.7);
  });

  it("evaluates both players together", () => {
    const evaluations = evaluateBatch(createResult());

    expect(evaluations).toHaveLength(2);

    expect(evaluations[0].score).toBe(0.6);
    expect(evaluations[1].score).toBe(0.3);
  });

  it("rejects an invalid batch result", () => {
    const result = createResult();

    result.player0Wins = 70;
    result.player1Wins = 40;

    expect(() => evaluatePlayer(result, 0)).toThrow(
      "Batch simulation game counts do not add up",
    );
  });
});

describe("Cyberpunk TCG deck matchup evaluation", () => {
  function createEvaluationDeck() {
    const card = {
      id: 1,
      name: "Test Unit",
      kind: "unit" as const,
      color: "red",
      cost: 1,
      power: 1,
      ram: 1,
    };

    const legend = {
      id: 100,
      name: "Test Legend",
      kind: "legend" as const,
      color: "red",
      ram: 1,
    };

    return {
      cards: Array.from({ length: 40 }, () => ({
        ...card,
      })),
      legends: [
        { ...legend, id: 100, name: "Test Legend A" },
        { ...legend, id: 101, name: "Test Legend B" },
        { ...legend, id: 102, name: "Test Legend C" },
      ],
    };
  }

  it("evaluates both first-player orientations", () => {
    const result = evaluateDeckMatchup(
      createEvaluationDeck(),
      createEvaluationDeck(),
      {
        gamesPerSide: 10,
        seed: 12345,
      },
    );

    expect(result.gamesPerSide).toBe(10);

    expect(result.candidateFirst.deck).toBe(
      "candidate",
    );

    expect(result.candidateFirst.firstPlayer).toBe(0);

    expect(result.candidateSecond.deck).toBe(
      "candidate",
    );

    expect(result.candidateSecond.firstPlayer).toBe(0);

    expect(result.overall.games).toBe(20);

    expect(
      result.overall.wins +
      result.overall.losses +
      result.overall.unfinishedGames,
    ).toBe(20);

    expect(result.overall.winRate).toBeGreaterThanOrEqual(0);
    expect(result.overall.winRate).toBeLessThanOrEqual(1);
  });

  it("uses separate seeds for the two orientations", () => {
    const deck = createEvaluationDeck();

    const result = evaluateDeckMatchup(
      deck,
      deck,
      {
        gamesPerSide: 5,
        seed: 20260924,
      },
    );

    expect(result.candidateFirst.games).toBe(5);
    expect(result.candidateSecond.games).toBe(5);
    expect(result.overall.games).toBe(10);
  });

  it("rejects an invalid gamesPerSide value", () => {
    expect(() =>
      evaluateDeckMatchup(
        createEvaluationDeck(),
        createEvaluationDeck(),
        {
          gamesPerSide: 0,
        },
      ),
    ).toThrow(
      "gamesPerSide must be a positive integer",
    );
  });
});
