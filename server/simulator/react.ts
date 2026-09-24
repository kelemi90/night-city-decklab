import type {
  CardInstance,
  GameState,
  PendingAttack,
  PlayerId,
} from "./types";

function rivalOf(playerId: PlayerId): PlayerId {
  return playerId === 0 ? 1 : 0;
}

/**
 * Return the player who currently has the React window.
 *
 * The defender reacts to the active player's attack.
 */
export function getReactPlayer(
  game: GameState,
): PlayerId {
  if (game.phase !== "react" || !game.pendingAttack) {
    throw new Error("There is no active React window.");
  }

  return rivalOf(game.pendingAttack.attackerPlayerId);
}

/**
 * Return the Units that can currently use Blocker.
 *
 * Blocker only applies when the pending attack targets the
 * rival Gig area.
 */
export function getAvailableBlockers(
  game: GameState,
): CardInstance[] {
  if (
    game.phase !== "react" ||
    !game.pendingAttack ||
    game.pendingAttack.type !== "gigs"
  ) {
    return [];
  }

  const defenderId = getReactPlayer(game);

  return game.players[defenderId].field.filter(
    (card) =>
      card.card.kind === "unit" &&
      card.card.blocker === true &&
      !card.spent &&
      !card.lag,
  );
}

/**
 * Return the currently legal React actions.
 *
 * Pass is always available.
 * Blocker is only available for Gig attacks.
 */
export function getReactActions(
  game: GameState,
): Array<
  | {
      type: "pass";
    }
  | {
      type: "blocker";
      blockerInstanceId: string;
    }
> {
  if (game.phase !== "react" || !game.pendingAttack) {
    throw new Error("There is no active React window.");
  }

  return [
    { type: "pass" },
    ...getAvailableBlockers(game).map((blocker) => ({
      type: "blocker" as const,
      blockerInstanceId: blocker.instanceId,
    })),
  ];
}

/**
 * Start a React window for an already-declared attack.
 *
 * This helper is intentionally small: attack validation and
 * actual combat resolution belong to combat.ts.
 */
export function beginReactWindow(
  game: GameState,
  pendingAttack: PendingAttack,
) {
  if (game.phase !== "main") {
    throw new Error(
      "A React window can only begin from the Main Phase.",
    );
  }

  if (game.pendingAttack) {
    throw new Error(
      "Another attack is already waiting for a React decision.",
    );
  }

  game.pendingAttack = pendingAttack;
  game.phase = "react";
}

/**
 * Pass the React window.
 *
 * Returns the attack that must now be resolved by combat.ts.
 */
export function passReact(
  game: GameState,
): PendingAttack {
  if (game.phase !== "react" || !game.pendingAttack) {
    throw new Error("There is no active React window.");
  }

  const pendingAttack = game.pendingAttack;

  game.pendingAttack = undefined;
  game.phase = "main";

  return pendingAttack;
}

/**
 * Spend a Blocker to redirect the pending Gig attack.
 *
 * Returns the selected Blocker. The actual fight resolution
 * remains in combat.ts.
 */
export function useBlocker(
  game: GameState,
  blockerInstanceId: string,
): CardInstance {
  if (game.phase !== "react" || !game.pendingAttack) {
    throw new Error("There is no active React window.");
  }

  if (game.pendingAttack.type !== "gigs") {
    throw new Error(
      "Blocker can only redirect a Gig attack.",
    );
  }

  const defenderId = getReactPlayer(game);
  const defender = game.players[defenderId];

  const blocker = defender.field.find(
    (card) =>
      card.instanceId === blockerInstanceId &&
      card.card.kind === "unit",
  );

  if (!blocker) {
    throw new Error(
      `Blocker ${blockerInstanceId} is not in the defender's field.`,
    );
  }

  if (!blocker.card.blocker) {
    throw new Error(
      `Unit ${blockerInstanceId} does not have Blocker.`,
    );
  }

  if (blocker.spent) {
    throw new Error(
      `Blocker ${blockerInstanceId} is already spent.`,
    );
  }

  if (blocker.lag) {
    throw new Error(
      `Blocker ${blockerInstanceId} has Lag and cannot use Blocker.`,
    );
  }

  blocker.spent = true;

  return blocker;
}
