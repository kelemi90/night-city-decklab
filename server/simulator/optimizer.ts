import type { CatalogCard } from "../../shared/deckRules";
import type { DeckRecommendation } from "../deckAdvisor";
import { recommendationToSimulatorDeck } from "./deckAdapter";
import {
  evaluateDeckMatchup,
  type DeckMatchupEvaluation,
  type EvaluationDeck,
  type MatchupSideEvaluation,
} from "./evaluation";

export type EvaluatedDeckCandidate = {
  recommendation: DeckRecommendation;
  deck: EvaluationDeck;
  evaluation: DeckMatchupEvaluation;
};

export type OptimizeDeckOptions = {
  gamesPerSide: number;
  seed?: number;
  maxTurns?: number;
};

export type OptimizedDeckResult = {
  winner: EvaluatedDeckCandidate;
  candidates: EvaluatedDeckCandidate[];
};

function compareCandidates(
  a: EvaluatedDeckCandidate,
  b: EvaluatedDeckCandidate,
): number {
  if (
    b.evaluation.overall.winRate !==
    a.evaluation.overall.winRate
  ) {
    return (
      b.evaluation.overall.winRate -
      a.evaluation.overall.winRate
    );
  }

  if (
    b.evaluation.overall.unfinishedGames !==
    a.evaluation.overall.unfinishedGames
  ) {
    return (
      a.evaluation.overall.unfinishedGames -
      b.evaluation.overall.unfinishedGames
    );
  }

  return (
    a.evaluation.averageTurns -
    b.evaluation.averageTurns
  );
}

function createEmptySideEvaluation(
  firstPlayer: 0 | 1,
): MatchupSideEvaluation {
  return {
    deck: "candidate",
    firstPlayer,
    games: 0,
    wins: 0,
    losses: 0,
    unfinishedGames: 0,
    winRate: 0,
    averageTurns: 0,
    averageAttacks: 0,
    averageGigSteals: 0,
    averageCardsPlayed: 0,
    averageUnitsDefeated: 0,
  };
}

function addSideEvaluation(
  aggregate: MatchupSideEvaluation,
  side: MatchupSideEvaluation,
): void {
  const previousGames = aggregate.games;
  const totalGames = previousGames + side.games;

  if (totalGames <= 0) {
    return;
  }

  aggregate.averageTurns =
    (
      aggregate.averageTurns * previousGames +
      side.averageTurns * side.games
    ) / totalGames;

  aggregate.averageAttacks =
    (
      aggregate.averageAttacks * previousGames +
      side.averageAttacks * side.games
    ) / totalGames;

  aggregate.averageGigSteals =
    (
      aggregate.averageGigSteals * previousGames +
      side.averageGigSteals * side.games
    ) / totalGames;

  aggregate.averageCardsPlayed =
    (
      aggregate.averageCardsPlayed * previousGames +
      side.averageCardsPlayed * side.games
    ) / totalGames;

  aggregate.averageUnitsDefeated =
    (
      aggregate.averageUnitsDefeated * previousGames +
      side.averageUnitsDefeated * side.games
    ) / totalGames;

  aggregate.games = totalGames;
  aggregate.wins += side.wins;
  aggregate.losses += side.losses;
  aggregate.unfinishedGames += side.unfinishedGames;
  aggregate.winRate = aggregate.wins / aggregate.games;
}

function createEmptyEvaluation(
  gamesPerSide: number,
): DeckMatchupEvaluation {
  return {
    gamesPerSide,
    candidateFirst: createEmptySideEvaluation(0),
    candidateSecond: createEmptySideEvaluation(0),
    overall: {
      games: 0,
      wins: 0,
      losses: 0,
      unfinishedGames: 0,
      winRate: 0,
    },
    averageTurns: 0,
    averageAttacks: 0,
    averageGigSteals: 0,
    averageCardsPlayed: 0,
    averageUnitsDefeated: 0,
  };
}

function addMatchupEvaluation(
  aggregate: DeckMatchupEvaluation,
  matchup: DeckMatchupEvaluation,
): void {
  const previousGames = aggregate.overall.games;
  const totalGames =
    previousGames + matchup.overall.games;

  addSideEvaluation(
    aggregate.candidateFirst,
    matchup.candidateFirst,
  );

  addSideEvaluation(
    aggregate.candidateSecond,
    matchup.candidateSecond,
  );

  aggregate.overall.games = totalGames;
  aggregate.overall.wins += matchup.overall.wins;
  aggregate.overall.losses += matchup.overall.losses;
  aggregate.overall.unfinishedGames +=
    matchup.overall.unfinishedGames;
  aggregate.overall.winRate =
    aggregate.overall.wins / totalGames;

  if (totalGames <= 0) {
    return;
  }

  aggregate.averageTurns =
    (
      aggregate.averageTurns * previousGames +
      matchup.averageTurns * matchup.overall.games
    ) / totalGames;

  aggregate.averageAttacks =
    (
      aggregate.averageAttacks * previousGames +
      matchup.averageAttacks * matchup.overall.games
    ) / totalGames;

  aggregate.averageGigSteals =
    (
      aggregate.averageGigSteals * previousGames +
      matchup.averageGigSteals * matchup.overall.games
    ) / totalGames;

  aggregate.averageCardsPlayed =
    (
      aggregate.averageCardsPlayed * previousGames +
      matchup.averageCardsPlayed * matchup.overall.games
    ) / totalGames;

  aggregate.averageUnitsDefeated =
    (
      aggregate.averageUnitsDefeated * previousGames +
      matchup.averageUnitsDefeated * matchup.overall.games
    ) / totalGames;
}

/**
 * Simulate one AI-generated deck recommendation against
 * a supplied opponent deck.
 *
 * This helper remains available for direct one-off matchup
 * evaluation. The optimizer itself uses round-robin evaluation.
 */
export async function evaluateDeckCandidate(
  recommendation: DeckRecommendation,
  opponent: EvaluationDeck,
  catalog: CatalogCard[],
  options: OptimizeDeckOptions,
): Promise<EvaluatedDeckCandidate> {
  const deck = await recommendationToSimulatorDeck(
    recommendation,
    catalog,
  );

  const evaluation = evaluateDeckMatchup(
    {
      cards: deck.main,
      legends: deck.legends,
    },
    opponent,
    options,
  );

  return {
    recommendation,
    deck: {
      cards: deck.main,
      legends: deck.legends,
    },
    evaluation,
  };
}

/**
 * Simulate every AI-generated candidate against every
 * other candidate in a round-robin tournament.
 *
 * For N candidates this produces N * (N - 1) / 2
 * actual matchup simulations, while aggregating each
 * result into both candidates' tournament records.
 *
 * Each evaluateDeckMatchup() call already simulates both
 * first-player orientations.
 */
function swapMatchupPerspective(
  matchup: DeckMatchupEvaluation,
): DeckMatchupEvaluation {
  return {
    ...matchup,
    candidateFirst: {
      ...matchup.candidateSecond,
      deck: "candidate",
    },
    candidateSecond: {
      ...matchup.candidateFirst,
      deck: "candidate",
    },
    overall: {
      ...matchup.overall,
      wins: matchup.overall.losses,
      losses: matchup.overall.wins,
      winRate:
        matchup.overall.games > 0
          ? matchup.overall.losses / matchup.overall.games
          : 0,
    },
  };
}

export async function optimizeDeckCandidates(
  recommendations: DeckRecommendation[],
  catalog: CatalogCard[],
  options: OptimizeDeckOptions,
): Promise<OptimizedDeckResult> {
  if (recommendations.length === 0) {
    throw new Error(
      "Cannot optimize an empty list of deck candidates.",
    );
  }

  if (
    !Number.isInteger(options.gamesPerSide) ||
    options.gamesPerSide <= 0
  ) {
    throw new Error(
      "gamesPerSide must be a positive integer.",
    );
  }

  const candidates = await Promise.all(
    recommendations.map(async (recommendation) => {
      const deck =
        await recommendationToSimulatorDeck(
          recommendation,
          catalog,
        );

      return {
        recommendation,
        deck: {
          cards: deck.main,
          legends: deck.legends,
        },
      };
    }),
  );

  const evaluations = candidates.map(() =>
    createEmptyEvaluation(
      options.gamesPerSide,
    ),
  );

  let matchupIndex = 0;

  for (
    let candidateIndex = 0;
    candidateIndex < candidates.length;
    candidateIndex += 1
  ) {
    for (
      let opponentIndex = candidateIndex + 1;
      opponentIndex < candidates.length;
      opponentIndex += 1
    ) {
      const candidate =
        candidates[candidateIndex];

      const opponent =
        candidates[opponentIndex];

      const matchupOptions: OptimizeDeckOptions = {
        ...options,
        seed:
          options.seed === undefined
            ? undefined
            : options.seed + matchupIndex * 2,
      };

      const matchup = evaluateDeckMatchup(
        candidate.deck,
        opponent.deck,
        matchupOptions,
      );

      addMatchupEvaluation(
        evaluations[candidateIndex],
        matchup,
      );

      addMatchupEvaluation(
        evaluations[opponentIndex],
        swapMatchupPerspective(matchup),
      );

      matchupIndex += 1;
    }
  }

  const evaluatedCandidates =
    candidates.map((candidate, index) => ({
      recommendation: candidate.recommendation,
      deck: candidate.deck,
      evaluation: evaluations[index],
    }));

  evaluatedCandidates.sort(compareCandidates);

  return {
    winner: evaluatedCandidates[0],
    candidates: evaluatedCandidates,
  };
}
