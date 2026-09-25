import type {
  BatchSimulationResult,
  SimulationOptions,
} from "./simulation";
import { simulateGames } from "./simulation";
import type {
  PlayerId,
  SimulatorCard,
} from "./types";

export type EvaluationDeck = {
  cards: SimulatorCard[];
  legends: SimulatorCard[];
};

export type PlayerEvaluation = {
  playerId: PlayerId;

  /**
   * Primary deck-performance score.
   *
   * 0 = no wins
   * 1 = wins every simulated game
   */
  score: number;

  winRate: number;

  averageTurns: number;

  averageAttacks: number;
  averageGigSteals: number;
  averageCardsPlayed: number;
  averageUnitsDefeated: number;

  games: number;
  wins: number;
  losses: number;
  unfinishedGames: number;
};

export type MatchupSideEvaluation = {
  /**
   * Which deck is being evaluated.
   */
  deck: "candidate" | "opponent";

  /**
   * Which simulator player went first.
   */
  firstPlayer: PlayerId;

  games: number;
  wins: number;
  losses: number;
  unfinishedGames: number;

  /**
   * Win rate among all simulated games.
   */
  winRate: number;

  averageTurns: number;

  averageAttacks: number;
  averageGigSteals: number;
  averageCardsPlayed: number;
  averageUnitsDefeated: number;
};

export type DeckMatchupEvaluation = {
  gamesPerSide: number;

  /**
   * Candidate deck goes first.
   */
  candidateFirst: MatchupSideEvaluation;

  /**
   * Candidate deck goes second.
   */
  candidateSecond: MatchupSideEvaluation;

  /**
   * Combined result across both first-player orientations.
   */
  overall: {
    games: number;
    wins: number;
    losses: number;
    unfinishedGames: number;
    winRate: number;
  };

  /**
   * Combined average metrics across all games.
   */
  averageTurns: number;
  averageAttacks: number;
  averageGigSteals: number;
  averageCardsPlayed: number;
  averageUnitsDefeated: number;
};

function validateBatchResult(
  result: BatchSimulationResult,
): void {
  if (!Number.isInteger(result.games) || result.games <= 0) {
    throw new Error("Cannot evaluate a batch with no games.");
  }

  if (
    result.player0Wins < 0 ||
    result.player1Wins < 0 ||
    result.unfinishedGames < 0
  ) {
    throw new Error(
      "Batch simulation contains invalid game counts.",
    );
  }

  const countedGames =
    result.player0Wins +
    result.player1Wins +
    result.unfinishedGames;

  if (countedGames !== result.games) {
    throw new Error(
      "Batch simulation game counts do not add up to the total games.",
    );
  }
}

/**
 * Convert aggregate simulation data into comparable
 * per-game metrics.
 *
 * This function does not run simulations and does not
 * modify the simulation result.
 */
export function evaluatePlayer(
  result: BatchSimulationResult,
  playerId: PlayerId,
): PlayerEvaluation {
  validateBatchResult(result);

  const opponentId: PlayerId =
    playerId === 0 ? 1 : 0;

  const wins =
    playerId === 0
      ? result.player0Wins
      : result.player1Wins;

  const opponentWins =
    opponentId === 0
      ? result.player0Wins
      : result.player1Wins;

  const average = (total: number): number =>
    total / result.games;

  return {
    playerId,

    score: wins / result.games,

    winRate:
      playerId === 0
        ? result.player0WinRate
        : result.player1WinRate,

    averageTurns: result.averageTurns,

    averageAttacks: average(
      result.totalAttacks[playerId],
    ),

    averageGigSteals: average(
      result.totalGigSteals[playerId],
    ),

    averageCardsPlayed: average(
      result.totalCardsPlayed[playerId],
    ),

    averageUnitsDefeated: average(
      result.totalUnitsDefeated[playerId],
    ),

    games: result.games,
    wins,
    losses: opponentWins,
    unfinishedGames: result.unfinishedGames,
  };
}

/**
 * Evaluate both sides of a simulation batch.
 */
export function evaluateBatch(
  result: BatchSimulationResult,
): [PlayerEvaluation, PlayerEvaluation] {
  return [
    evaluatePlayer(result, 0),
    evaluatePlayer(result, 1),
  ];
}

function evaluateMatchupSide(
  result: BatchSimulationResult,
  deck: "candidate" | "opponent",
  playerId: PlayerId,
  firstPlayer: PlayerId,
): MatchupSideEvaluation {
  const evaluation = evaluatePlayer(
    result,
    playerId,
  );

  return {
    deck,
    firstPlayer,
    games: evaluation.games,
    wins: evaluation.wins,
    losses: evaluation.losses,
    unfinishedGames: evaluation.unfinishedGames,
    winRate: evaluation.winRate,
    averageTurns: evaluation.averageTurns,
    averageAttacks: evaluation.averageAttacks,
    averageGigSteals: evaluation.averageGigSteals,
    averageCardsPlayed: evaluation.averageCardsPlayed,
    averageUnitsDefeated: evaluation.averageUnitsDefeated,
  };
}

/**
 * Evaluate two decks against each other from both
 * first-player orientations.
 *
 * Orientation 1:
 *   candidate = Player 0
 *   opponent  = Player 1
 *
 * Orientation 2:
 *   opponent  = Player 0
 *   candidate = Player 1
 *
 * Both orientations use Player 0 as the first player.
 * This means candidateFirst represents the candidate
 * going first, while candidateSecond represents the
 * candidate going second.
 */
export function evaluateDeckMatchup(
  candidate: EvaluationDeck,
  opponent: EvaluationDeck,
  options: {
    gamesPerSide: number;
    seed?: number;
    maxTurns?: number;
  },
): DeckMatchupEvaluation {
  if (
    !Number.isInteger(options.gamesPerSide) ||
    options.gamesPerSide <= 0
  ) {
    throw new Error(
      "gamesPerSide must be a positive integer.",
    );
  }

  const candidateFirstOptions: SimulationOptions = {
    player0Cards: candidate.cards,
    player0Legends: candidate.legends,
    player1Cards: opponent.cards,
    player1Legends: opponent.legends,
    firstPlayer: 0,
    maxTurns: options.maxTurns,
  };

  const candidateSecondOptions: SimulationOptions = {
    player0Cards: opponent.cards,
    player0Legends: opponent.legends,
    player1Cards: candidate.cards,
    player1Legends: candidate.legends,
    firstPlayer: 0,
    maxTurns: options.maxTurns,
  };

  const candidateFirstResult = simulateGames(
    candidateFirstOptions,
    {
      games: options.gamesPerSide,
      seed: options.seed,
    },
  );

  const candidateSecondResult = simulateGames(
    candidateSecondOptions,
    {
      games: options.gamesPerSide,
      seed:
        options.seed === undefined
          ? undefined
          : options.seed + 1,
    },
  );

  const candidateFirst = evaluateMatchupSide(
    candidateFirstResult,
    "candidate",
    0,
    0,
  );

  const candidateSecond = evaluateMatchupSide(
    candidateSecondResult,
    "candidate",
    1,
    0,
  );

  const totalGames =
    candidateFirst.games +
    candidateSecond.games;

  const totalWins =
    candidateFirst.wins +
    candidateSecond.wins;

  const totalLosses =
    candidateFirst.losses +
    candidateSecond.losses;

  const totalUnfinished =
    candidateFirst.unfinishedGames +
    candidateSecond.unfinishedGames;

  const weightedAverage = (
    first: number,
    second: number,
  ): number =>
    (
      first * candidateFirst.games +
      second * candidateSecond.games
    ) / totalGames;

  return {
    gamesPerSide: options.gamesPerSide,

    candidateFirst,
    candidateSecond,

    overall: {
      games: totalGames,
      wins: totalWins,
      losses: totalLosses,
      unfinishedGames: totalUnfinished,
      winRate: totalWins / totalGames,
    },

    averageTurns: weightedAverage(
      candidateFirst.averageTurns,
      candidateSecond.averageTurns,
    ),

    averageAttacks: weightedAverage(
      candidateFirst.averageAttacks,
      candidateSecond.averageAttacks,
    ),

    averageGigSteals: weightedAverage(
      candidateFirst.averageGigSteals,
      candidateSecond.averageGigSteals,
    ),

    averageCardsPlayed: weightedAverage(
      candidateFirst.averageCardsPlayed,
      candidateSecond.averageCardsPlayed,
    ),

    averageUnitsDefeated: weightedAverage(
      candidateFirst.averageUnitsDefeated,
      candidateSecond.averageUnitsDefeated,
    ),
  };
}
