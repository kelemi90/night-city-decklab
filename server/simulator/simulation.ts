import { setupGame } from "./game";
import { endTurn, startTurn } from "./turn";
import {
  declareGigAttack,
  resolvePendingAttack,
} from "./combat";
import {
  passReact,
} from "./react";
import {
  playUnit,
} from "./actions";
import type {
  GigDie,
  PlayerId,
  SimulatorCard,
} from "./types";

export type SimulationStats = {
  attacks: [number, number];
  gigSteals: [number, number];
  cardsPlayed: [number, number];
  unitsDefeated: [number, number];
};

export type SimulationResult = {
  winner?: PlayerId;
  turns: number;
  gameOver: boolean;

  finalGigs: [number, number];

  stats: SimulationStats;
};

export type SimulationOptions = {
  player0Cards: SimulatorCard[];
  player0Legends: SimulatorCard[];
  player1Cards: SimulatorCard[];
  player1Legends: SimulatorCard[];
  firstPlayer?: PlayerId;
  random?: () => number;
  maxTurns?: number;
};

const START_GIG_ORDER: GigDie[] = [
  "d4",
  "d6",
  "d8",
  "d10",
  "d12",
  "d20",
];

function chooseStartGig(
  game: ReturnType<typeof setupGame>,
): GigDie | undefined {
  const player = game.players[game.activePlayer];

  return START_GIG_ORDER.find((candidate) =>
    player.fixer.includes(candidate),
  );
}

function createStats(): SimulationStats {
  return {
    attacks: [0, 0],
    gigSteals: [0, 0],
    cardsPlayed: [0, 0],
    unitsDefeated: [0, 0],
  };
}

/**
 * Play the simplest deterministic Main Phase policy.
 *
 * For now this policy:
 * 1. Plays every affordable 0-cost Unit from hand.
 * 2. Uses every ready Unit to attack the rival Gig area.
 * 3. Always passes the React window.
 *
 * This is deliberately simple. It is a baseline for the simulator,
 * not the final AI strategy.
 */
function playMainPhase(
  game: ReturnType<typeof setupGame>,
  stats: SimulationStats,
) {
  const playerId = game.activePlayer;
  const player = game.players[playerId];

  /*
   * Play affordable Units.
   *
   * We only use 0-cost Units in this first baseline so that
   * resource strategy is not mixed into the simulation yet.
   */
  let playedUnit = true;

  while (playedUnit) {
    playedUnit = false;

    const unit = player.hand.find(
      (card) =>
        card.card.kind === "unit" &&
        (card.card.cost ?? 0) === 0,
    );

    if (!unit) {
      break;
    }

    playUnit(game, playerId, unit.instanceId);
    stats.cardsPlayed[playerId] += 1;
    playedUnit = true;
  }

  /*
   * Attack with every Unit that is currently able to attack.
   *
   * New Units have Lag, so they naturally wait until the
   * next turn before they can attack.
   */
  const attackers = player.field.filter(
    (card) =>
      card.card.kind === "unit" &&
      !card.spent &&
      !card.lag,
  );

  for (const attacker of attackers) {
    if (game.phase !== "main") {
      break;
    }

    const gigsBefore = game.players[
      playerId === 0 ? 1 : 0
    ].gigs.length;

    const pending = declareGigAttack(
      game,
      playerId,
      attacker.instanceId,
    );

    stats.attacks[playerId] += 1;

    /*
     * Baseline policy always passes React.
     *
     * Blocker decisions will be added as a separate policy layer.
     */
    const resolvedPending = passReact(game);

    if (resolvedPending !== pending) {
      throw new Error(
        "React returned a different pending attack.",
      );
    }

    resolvePendingAttack(game, resolvedPending);

    const gigsAfter = game.players[
      playerId === 0 ? 1 : 0
    ].gigs.length;

    if (gigsAfter < gigsBefore) {
      stats.gigSteals[playerId] += gigsBefore - gigsAfter;
    }
  }
}

export function simulateGame(
  options: SimulationOptions,
): SimulationResult {
  const game = setupGame(
    options.player0Cards,
    options.player0Legends,
    options.player1Cards,
    options.player1Legends,
    options.firstPlayer ?? 0,
    options.random ?? Math.random,
  );

  const random = options.random ?? Math.random;
  const maxTurns = options.maxTurns ?? 200;
  const stats = createStats();

  while (game.phase !== "game-over") {
    if (game.turn > maxTurns) {
      throw new Error(
        `Simulation exceeded the ${maxTurns}-turn safety limit.`,
      );
    }

    const die = chooseStartGig(game);
    const player = game.players[game.activePlayer];

    if (player.gigs.length >= 7) {
      game.winner = game.activePlayer;
      game.phase = "game-over";
      break;
    }

    startTurn(game, die, random);

    playMainPhase(game, stats);
    endTurn(game);
  }

  return {
    winner: game.winner,
    turns: game.turn,
    gameOver: game.phase === "game-over",
    finalGigs: [
      game.players[0].gigs.length,
      game.players[1].gigs.length,
    ],
    stats,
  };
}

export type BatchSimulationOptions = {
  games: number;
  seed?: number;
};

export type BatchSimulationResult = {
  games: number;
  player0Wins: number;
  player1Wins: number;
  unfinishedGames: number;

  player0WinRate: number;
  player1WinRate: number;

  averageTurns: number;

  totalAttacks: [number, number];
  totalGigSteals: [number, number];
  totalCardsPlayed: [number, number];
  totalUnitsDefeated: [number, number];
};

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createEmptyBatchResult(): BatchSimulationResult {
  return {
    games: 0,
    player0Wins: 0,
    player1Wins: 0,
    unfinishedGames: 0,

    player0WinRate: 0,
    player1WinRate: 0,

    averageTurns: 0,

    totalAttacks: [0, 0],
    totalGigSteals: [0, 0],
    totalCardsPlayed: [0, 0],
    totalUnitsDefeated: [0, 0],
  };
}

export function simulateGames(
  options: SimulationOptions,
  batch: BatchSimulationOptions,
): BatchSimulationResult {
  if (!Number.isInteger(batch.games) || batch.games <= 0) {
    throw new Error("Batch simulation requires at least one game.");
  }

  const result = createEmptyBatchResult();
  const baseSeed = batch.seed ?? 1;

  let totalTurns = 0;

  for (let gameIndex = 0; gameIndex < batch.games; gameIndex += 1) {
    const random = createSeededRandom(
      (baseSeed + gameIndex) >>> 0,
    );

    const game = simulateGame({
      ...options,
      random,
    });

    result.games += 1;
    totalTurns += game.turns;

    if (game.winner === 0) {
      result.player0Wins += 1;
    } else if (game.winner === 1) {
      result.player1Wins += 1;
    } else {
      result.unfinishedGames += 1;
    }

    result.totalAttacks[0] += game.stats.attacks[0];
    result.totalAttacks[1] += game.stats.attacks[1];

    result.totalGigSteals[0] += game.stats.gigSteals[0];
    result.totalGigSteals[1] += game.stats.gigSteals[1];

    result.totalCardsPlayed[0] += game.stats.cardsPlayed[0];
    result.totalCardsPlayed[1] += game.stats.cardsPlayed[1];

    result.totalUnitsDefeated[0] += game.stats.unitsDefeated[0];
    result.totalUnitsDefeated[1] += game.stats.unitsDefeated[1];
  }

  result.averageTurns = totalTurns / result.games;
  result.player0WinRate = result.player0Wins / result.games;
  result.player1WinRate = result.player1Wins / result.games;

  return result;
}
