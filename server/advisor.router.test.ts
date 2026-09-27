import { describe, expect, it, vi } from "vitest";

const {
  getCollection,
  addActivity,
  recommendDecks,
  ownedCatalogRows,
  optimizeDeckCandidates,
} = vi.hoisted(() => ({
  getCollection: vi.fn(),
  addActivity: vi.fn(),
  recommendDecks: vi.fn(),
  ownedCatalogRows: vi.fn(),
  optimizeDeckCandidates: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");

  return {
    ...actual,
    getCollection,
    addActivity,
  };
});

vi.mock("./deckAdvisor", async () => {
  const actual =
    await vi.importActual<typeof import("./deckAdvisor")>("./deckAdvisor");

  return {
    ...actual,
    ownedCatalogRows,
    recommendDecks,
  };
});

vi.mock("./simulator/optimizer", async () => {
  const actual =
    await vi.importActual<typeof import("./simulator/optimizer")>(
      "./simulator/optimizer",
    );

  return {
    ...actual,
    optimizeDeckCandidates,
  };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { DeckRecommendation } from "./deckAdvisor";
import type {
  EvaluatedDeckCandidate,
  OptimizedDeckResult,
} from "./simulator/optimizer";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "advisor-router-test",
    email: "advisor-router-test@example.com",
    name: "Advisor Router Test",
    loginMethod: "local",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createRecommendation(
  name: string,
  strategy: string,
): DeckRecommendation {
  return {
    name,
    strategy,
    summary: `${name} summary`,
    whyLegends: ["Legend A", "Legend B", "Legend C"],
    legends: [
      { cardId: 1, quantity: 1 },
      { cardId: 2, quantity: 1 },
      { cardId: 3, quantity: 1 },
    ],
    main: [{ cardId: 8, quantity: 40 }],
    upgradeSuggestions: [],
    totalMain: 40,
  };
}

function createEvaluatedCandidate(
  recommendation: DeckRecommendation,
  winRate: number,
): EvaluatedDeckCandidate {
  return {
    recommendation,
    deck: {
      cards: [],
      legends: [],
    },
    evaluation: {
      overall: {
        games: 20,
        wins: Math.round(winRate * 20),
        losses: 20 - Math.round(winRate * 20),
        unfinishedGames: 0,
        winRate,
        averageTurns: 18,
      },
      bySide: {
        first: {
          games: 10,
          wins: Math.round(winRate * 10),
          losses: 10 - Math.round(winRate * 10),
          unfinishedGames: 0,
          winRate,
          averageTurns: 18,
        },
        second: {
          games: 10,
          wins: Math.round(winRate * 10),
          losses: 10 - Math.round(winRate * 10),
          unfinishedGames: 0,
          winRate,
          averageTurns: 18,
        },
      },
    },
    matchups: [
      {
        opponentName: "Opponent",
        games: 10,
        wins: Math.round(winRate * 10),
        losses: 10 - Math.round(winRate * 10),
        unfinishedGames: 0,
        winRate,
        averageTurns: 18,
      },
    ],
  };
}

describe("advisor.recommendMany router contract", () => {
  it("forwards advisor preferences into generation, simulates the generated recommendations, and preserves the ranked result payload", async () => {
    const requestedGoals = ["aggro", "control", "aggro"] as const;
    const expectedGoals = ["aggro", "control"];
    const weights = {
      speed: 80,
      control: 35,
      budget: 65,
    };

    const generatedRecommendations = [
      createRecommendation("Aggro Build", "aggro"),
      createRecommendation("Control Build", "control"),
    ];

    const rankedCandidates = [
      createEvaluatedCandidate(generatedRecommendations[1], 0.72),
      createEvaluatedCandidate(generatedRecommendations[0], 0.61),
    ];

    const optimized: OptimizedDeckResult = {
      winner: rankedCandidates[0],
      candidates: rankedCandidates,
    };

    getCollection.mockResolvedValue([
      { cardId: 1, quantity: 1 },
      { cardId: 2, quantity: 1 },
      { cardId: 3, quantity: 1 },
      { cardId: 8, quantity: 40 },
    ]);

    ownedCatalogRows.mockReturnValue([
      {
        id: 1,
        name: "Legend A",
        kind: "legend",
        color: "red",
        ram: 1,
        ownedQuantity: 1,
      },
    ]);

    recommendDecks.mockResolvedValue(generatedRecommendations);
    optimizeDeckCandidates.mockResolvedValue(optimized);
    addActivity.mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createAuthContext());

    const result = await caller.advisor.recommendMany({
      goals: [...requestedGoals],
      weights,
      edition: "retail",
    });

    expect(recommendDecks).toHaveBeenCalledTimes(1);
    expect(recommendDecks).toHaveBeenCalledWith(
      expect.anything(),
      expectedGoals,
      weights,
    );

    expect(optimizeDeckCandidates).toHaveBeenCalledTimes(1);
    expect(optimizeDeckCandidates).toHaveBeenCalledWith(
      generatedRecommendations,
      expect.anything(),
      {
        gamesPerSide: 10,
        maxTurns: 200,
      },
    );

    expect(result).toHaveLength(2);

    expect(result.map((candidate) => candidate.name)).toEqual([
      "Control Build",
      "Aggro Build",
    ]);

    expect(result.map((candidate) => candidate.simulation.overall.winRate)).toEqual([
      0.72,
      0.61,
    ]);

    expect(result[0]?.matchups).toEqual(rankedCandidates[0]?.matchups);
    expect(result[1]?.matchups).toEqual(rankedCandidates[1]?.matchups);

    for (const candidate of result) {
      expect(candidate.advisorConfig).toEqual({
        goals: expectedGoals,
        weights,
      });
      expect(candidate.edition).toBe("retail");
      expect(candidate.simulation).toBeDefined();
      expect(candidate.matchups).toBeDefined();
    }

    expect(result[0]?.simulation).toBe(rankedCandidates[0]?.evaluation);
    expect(result[1]?.simulation).toBe(rankedCandidates[1]?.evaluation);
  });
});
