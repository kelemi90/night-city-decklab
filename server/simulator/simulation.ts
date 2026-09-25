import { setupGame } from "./game";
import { endTurn, startTurn } from "./turn";
import {
  declareGigAttack,
  declareUnitAttack,
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

export type SimulationEvent =
  | {
      type: "turn-start";
      turn: number;
      playerId: PlayerId;
      gigs: number;
      handSize: number;
      deckSize: number;
    }
  | {
      type: "card-played";
      turn: number;
      playerId: PlayerId;
      cardId: number;
      cardName: string;
      cardKind: SimulatorCard["kind"];
    }
  | {
      type: "attack";
      turn: number;
      playerId: PlayerId;
      attackerId: number;
      attackerName: string;
      target: "unit" | "gigs";
      defenderId?: number;
      defenderName?: string;
    }
  | {
      type: "fight-result";
      turn: number;
      playerId: PlayerId;
      attackerId: number;
      attackerName: string;
      defenderId: number;
      defenderName: string;
      winner?: PlayerId;
      tied: boolean;
    }
  | {
      type: "gig-steal";
      turn: number;
      playerId: PlayerId;
      amount: number;
      finalGigs: [number, number];
    }
  | {
      type: "game-over";
      turn: number;
      winner?: PlayerId;
      reason: "seven-gigs" | "deck-out";
      finalGigs: [number, number];
    };

export type SimulationResult = {
  winner?: PlayerId;
  turns: number;
  gameOver: boolean;

  finalGigs: [number, number];

  stats: SimulationStats;

  events: SimulationEvent[];
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
 * Play the deterministic baseline Main Phase policy.
 *
 * 1. Play the highest-cost affordable Unit from hand.
 * 2. Repeat while another Unit can be paid for.
 * 3. Attack the strongest spent rival Unit when available.
 * 4. Otherwise attack the rival Gig area.
 * 5. Always pass the React window.
 *
 * This is a baseline policy, not the final AI strategy.
 */
function playMainPhase(
  game: ReturnType<typeof setupGame>,
  stats: SimulationStats,
  events: SimulationEvent[],
) {
  const playerId = game.activePlayer;
  const rivalId: PlayerId = playerId === 0 ? 1 : 0;
  const player = game.players[playerId];
  const rival = game.players[rivalId];

  while (game.phase === "main") {
    const availableResources =
      player.eddies +
      player.legends.filter((legend) => !legend.spent).length;

    const affordableUnits = player.hand.filter(
      (card) =>
        card.card.kind === "unit" &&
        (card.card.cost ?? 0) <= availableResources,
    );

    const unit = affordableUnits.sort(
      (a, b) =>
        (b.card.cost ?? 0) - (a.card.cost ?? 0) ||
        (b.card.power ?? 0) - (a.card.power ?? 0) ||
        a.instanceId.localeCompare(b.instanceId),
    )[0];

    if (!unit) {
      break;
    }

    const cardId = unit.card.id;
    const cardName = unit.card.name;
    const cardKind = unit.card.kind;

    playUnit(game, playerId, unit.instanceId);

    stats.cardsPlayed[playerId] += 1;

    events.push({
      type: "card-played",
      turn: game.turn,
      playerId,
      cardId,
      cardName,
      cardKind,
    });
  }

  const attackers = player.field
    .filter(
      (card) =>
        card.card.kind === "unit" &&
        !card.spent &&
        (!card.lag || card.card.adrenaline),
    )
    .sort(
      (a, b) =>
        (b.card.power ?? 0) - (a.card.power ?? 0) ||
        a.instanceId.localeCompare(b.instanceId),
    );

  for (const attacker of attackers) {
    if (game.phase !== "main") {
      break;
    }

    /*
     * Official rule: only spent rival Units can be attacked.
     *
     * Choose the strongest available spent rival Unit.
     */
    const defender = rival.field
      .filter(
        (card) =>
          card.card.kind === "unit" &&
          card.spent,
      )
      .sort(
        (a, b) =>
          (b.card.power ?? 0) - (a.card.power ?? 0) ||
          a.instanceId.localeCompare(b.instanceId),
      )[0];

    if (defender) {
      const pending = declareUnitAttack(
        game,
        playerId,
        attacker.instanceId,
        defender.instanceId,
      );

      stats.attacks[playerId] += 1;

      events.push({
        type: "attack",
        turn: game.turn,
        playerId,
        attackerId: attacker.card.id,
        attackerName: attacker.card.name,
        target: "unit",
        defenderId: defender.card.id,
        defenderName: defender.card.name,
      });

      const resolvedPending = passReact(game);

      if (resolvedPending !== pending) {
        throw new Error(
          "React returned a different pending attack.",
        );
      }

      const result = resolvePendingAttack(
        game,
        resolvedPending,
      );

      if (result.type === "fight") {
        if (result.winner === undefined) {
          stats.unitsDefeated[0] += 1;
          stats.unitsDefeated[1] += 1;
        } else {
          stats.unitsDefeated[result.winner] += 1;
        }

        events.push({
          type: "fight-result",
          turn: game.turn,
          playerId,
          attackerId: attacker.card.id,
          attackerName: attacker.card.name,
          defenderId: defender.card.id,
          defenderName: defender.card.name,
          winner: result.winner,
          tied: result.winner === undefined,
        });
      }

      continue;
    }

    /*
     * No spent rival Unit is available, so attack Gigs.
     */
    const gigsBefore = rival.gigs.length;

    const pending = declareGigAttack(
      game,
      playerId,
      attacker.instanceId,
    );

    stats.attacks[playerId] += 1;

    events.push({
      type: "attack",
      turn: game.turn,
      playerId,
      attackerId: attacker.card.id,
      attackerName: attacker.card.name,
      target: "gigs",
    });

    const resolvedPending = passReact(game);

    if (resolvedPending !== pending) {
      throw new Error(
        "React returned a different pending attack.",
      );
    }

    resolvePendingAttack(game, resolvedPending);

    const gigsAfter = rival.gigs.length;

    if (gigsAfter < gigsBefore) {
      const amount = gigsBefore - gigsAfter;

      stats.gigSteals[playerId] += amount;

      events.push({
        type: "gig-steal",
        turn: game.turn,
        playerId,
        amount,
        finalGigs: [
          game.players[0].gigs.length,
          game.players[1].gigs.length,
        ],
      });
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
  const events: SimulationEvent[] = [];

  while (game.phase !== "game-over") {
    if (game.turn > maxTurns) {
      throw new Error(
        `Simulation exceeded the ${maxTurns}-turn safety limit.`,
      );
    }

    const die = chooseStartGig(game);
    const player = game.players[game.activePlayer];

    /*
     * A player wins by starting their turn with seven Gigs.
     */
    if (player.gigs.length >= 7) {
      game.winner = game.activePlayer;
      game.phase = "game-over";

      events.push({
        type: "game-over",
        turn: game.turn,
        winner: game.winner,
        reason: "seven-gigs",
        finalGigs: [
          game.players[0].gigs.length,
          game.players[1].gigs.length,
        ],
      });

      break;
    }

    startTurn(game, die, random);

    /*
     * startTurn() can end the game immediately when the active
     * player is required to draw from an empty deck.
     */
    if (game.winner !== undefined) {
      events.push({
        type: "game-over",
        turn: game.turn,
        winner: game.winner,
        reason: "deck-out",
        finalGigs: [
          game.players[0].gigs.length,
          game.players[1].gigs.length,
        ],
      });

      break;
    }

    events.push({
      type: "turn-start",
      turn: game.turn,
      playerId: game.activePlayer,
      gigs: game.players[game.activePlayer].gigs.length,
      handSize: game.players[game.activePlayer].hand.length,
      deckSize: game.players[game.activePlayer].deck.length,
    });

    playMainPhase(game, stats, events);

    if (game.winner !== undefined) {
      events.push({
        type: "game-over",
        turn: game.turn,
        winner: game.winner,
        reason: "seven-gigs",
        finalGigs: [
          game.players[0].gigs.length,
          game.players[1].gigs.length,
        ],
      });

      break;
    }

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
    events,
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
