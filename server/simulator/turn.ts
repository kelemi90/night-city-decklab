import {
  checkImmediateWinner,
  drawCards,
  gainGig,
} from "./game";
import {
  clearLag,
  resetTurnActions,
} from "./actions";
import type {
  GameState,
  GigDie,
  PlayerId,
} from "./types";

/**
 * Ready all cards that are currently spent.
 */
export function readyPlayer(
  player: GameState["players"][PlayerId],
) {
  for (const card of player.field) {
    card.spent = false;
  }

  for (const legend of player.legends) {
    legend.spent = false;
  }
}

/**
 * Draw the normal Start Phase card.
 */
export function drawForTurn(
  game: GameState,
  playerId: PlayerId,
) {
  const player = game.players[playerId];

  drawCards(player, 1);
}

/**
 * Gain a Gig during the Start Phase.
 */
export function gainStartGig(
  game: GameState,
  playerId: PlayerId,
  die: GigDie | undefined,
  random: () => number = Math.random,
) {
  if (die === undefined) {
    return;
  }

  gainGig(game, playerId, die, random);
}

/**
 * Begin the active player's turn.
 *
 * Start Phase:
 * 1. Ready spent cards
 * 2. Draw 1
 * 3. Gain a Gig
 * 4. Check immediate victory
 */
export function startTurn(
  game: GameState,
  die: GigDie | undefined,
  random: () => number = Math.random,
) {
  if (game.phase === "game-over") {
    throw new Error("The game is already over.");
  }

  if (game.phase !== "start") {
    throw new Error(
      `Cannot start turn while game phase is "${game.phase}".`,
    );
  }

  const playerId = game.activePlayer;
  const player = game.players[playerId];

  /*
   * Official Beta win condition:
   *
   * If a player starts their turn with 7 or more Gigs,
   * they win before taking any other Start Phase action.
   */
  if (player.gigs.length >= 7) {
    game.winner = playerId;
    game.phase = "game-over";
    return;
  }

  /*
   * Lag lasts until the end of the previous turn.
   */
  clearLag(player);

  /*
   * Reset once-per-turn Main Phase actions.
   */
  resetTurnActions(player);

  /*
   * Start Phase:
   * 1. Ready
   * 2. Draw 1
   * 3. Gain a Gig
   */
  readyPlayer(player);

  drawForTurn(game, playerId);

  gainStartGig(game, playerId, die, random);

  /*
   * Reaching seven Gigs during this Start Phase does NOT
   * immediately end the game. The player must start their
   * next turn with seven Gigs.
   */
  game.phase = "main";
}

/**
 * End the active player's turn and pass control
 * to the opponent.
 */
export function endTurn(game: GameState) {
  if (game.phase !== "main") {
    throw new Error(
      `Cannot end turn while game phase is "${game.phase}".`,
    );
  }

  const player = game.players[game.activePlayer];

  /*
   * Lag lasts until the end of the turn.
   *
   * Clearing it here means that Units will be ready to attack
   * when their controller starts the next turn.
   */
  clearLag(player);

  const nextPlayer: PlayerId =
    game.activePlayer === 0 ? 1 : 0;

  game.activePlayer = nextPlayer;
  game.turn += 1;
  game.phase = "start";
}

/**
 * Return whether a Unit can currently attack.
 */
export function canAttack(
  card: GameState["players"][PlayerId]["field"][number],
): boolean {
  return (
    card.card.kind === "unit" &&
    !card.lag &&
    !card.spent
  );
}
