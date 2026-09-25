import type {
  CardInstance,
  GameState,
  PlayerId,
  PendingAttack,
} from "./types";

import {
  beginReactWindow,
  passReact,
} from "./react";

export type AttackResult =
  | {
      type: "fight";
      attacker: CardInstance;
      defender: CardInstance;
      winner?: PlayerId;
    }
  | {
      type: "steal";
      attacker: CardInstance;
      stolen: number;
      winner?: PlayerId;
    };

function rivalOf(playerId: PlayerId): PlayerId {
  return playerId === 0 ? 1 : 0;
}


/**
 * Validate and declare a Unit-vs-Unit attack.
 *
 * The attacker is spent immediately when the attack is declared.
 * The defender then receives the React window before the fight
 * is resolved.
 */
export function declareUnitAttack(
  game: GameState,
  playerId: PlayerId,
  attackerInstanceId: string,
  defenderInstanceId: string,
): PendingAttack {
  if (game.phase !== "main") {
    throw new Error("Attacks can only be declared during the Main Phase.");
  }

  const attackerPlayer = game.players[playerId];
  const rivalPlayer = game.players[rivalOf(playerId)];

  const attacker = findFieldUnit(
    attackerPlayer,
    attackerInstanceId,
  );

  if (attacker.lag && !attacker.card.adrenaline) {
    throw new Error(
      `Unit ${attacker.instanceId} has Lag and cannot attack.`,
    );
  }

  if (attacker.spent) {
    throw new Error(
      `Unit ${attacker.instanceId} is already spent.`,
    );
  }

  findSpentRivalUnit(
    rivalPlayer,
    defenderInstanceId,
  );

  attacker.spent = true;

  const pendingAttack: PendingAttack = {
    type: "unit",
    attackerPlayerId: playerId,
    attackerInstanceId,
    defenderInstanceId,
  };

  beginReactWindow(game, pendingAttack);

  return pendingAttack;
}

/**
 * Validate and declare a Gig attack.
 *
 * The attacker is spent immediately when the attack is declared.
 * The defender then receives the React window and may use Blocker.
 */
export function declareGigAttack(
  game: GameState,
  playerId: PlayerId,
  attackerInstanceId: string,
): PendingAttack {
  if (game.phase !== "main") {
    throw new Error("Attacks can only be declared during the Main Phase.");
  }

  const attackerPlayer = game.players[playerId];

  const attacker = findFieldUnit(
    attackerPlayer,
    attackerInstanceId,
  );

  if (attacker.lag && !attacker.card.adrenaline) {
    throw new Error(
      `Unit ${attacker.instanceId} has Lag and cannot attack.`,
    );
  }

  if (attacker.spent) {
    throw new Error(
      `Unit ${attacker.instanceId} is already spent.`,
    );
  }

  attacker.spent = true;

  const pendingAttack: PendingAttack = {
    type: "gigs",
    attackerPlayerId: playerId,
    attackerInstanceId,
  };

  beginReactWindow(game, pendingAttack);

  return pendingAttack;
}

/**
 * Resolve the attack currently waiting in the React window.
 *
 * For a normal attack, the caller should first use passReact().
 * For a Blocker reaction, pass the Blocker's instance ID.
 */
export function resolvePendingAttack(
  game: GameState,
  pendingAttack: PendingAttack,
  blockerInstanceId?: string,
): AttackResult {
  if (game.phase !== "main") {
    throw new Error(
      "A pending attack can only be resolved after the React window closes.",
    );
  }

  const attackerPlayer = game.players[
    pendingAttack.attackerPlayerId
  ];

  const rivalPlayer = game.players[
    rivalOf(pendingAttack.attackerPlayerId)
  ];

  const attacker = findFieldUnit(
    attackerPlayer,
    pendingAttack.attackerInstanceId,
  );

  if (pendingAttack.type === "unit") {
    const defender = findSpentRivalUnit(
      rivalPlayer,
      pendingAttack.defenderInstanceId,
    );

    return resolveFight(
      game,
      pendingAttack.attackerPlayerId,
      attacker,
      defender,
    );
  }

  if (blockerInstanceId !== undefined) {
    const blocker = rivalPlayer.field.find(
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

    if (!blocker.spent) {
      throw new Error(
        `Blocker ${blockerInstanceId} must be spent before resolution.`,
      );
    }

    return resolveFight(
      game,
      pendingAttack.attackerPlayerId,
      attacker,
      blocker,
    );
  }

  const power = unitPower(attacker);

  if (power <= 0) {
    return {
      type: "steal",
      attacker,
      stolen: 0,
    };
  }

  const requestedSteal = 1 + Math.floor(power / 10);
  const stolen = Math.min(
    requestedSteal,
    rivalPlayer.gigs.length,
  );

  for (let index = 0; index < stolen; index += 1) {
    const gig = rivalPlayer.gigs.shift();

    if (!gig) {
      break;
    }

    attackerPlayer.gigs.push(gig);
  }

  return {
    type: "steal",
    attacker,
    stolen,
  };
}

/**
 * Find a Unit in a player's field.
 */
function findFieldUnit(
  player: GameState["players"][PlayerId],
  instanceId: string,
): CardInstance {
  const unit = player.field.find(
    (card) =>
      card.instanceId === instanceId &&
      card.card.kind === "unit",
  );

  if (!unit) {
    throw new Error(
      `Unit ${instanceId} is not in player ${player.id}'s field.`,
    );
  }

  return unit;
}

/**
 * Find a spent rival Unit.
 *
 * Only spent Units can normally be attacked directly.
 */
function findSpentRivalUnit(
  player: GameState["players"][PlayerId],
  instanceId: string,
): CardInstance {
  const unit = player.field.find(
    (card) =>
      card.instanceId === instanceId &&
      card.card.kind === "unit",
  );

  if (!unit) {
    throw new Error(
      `Rival Unit ${instanceId} is not in the field.`,
    );
  }

  if (!unit.spent) {
    throw new Error(
      `Unit ${instanceId} is ready and cannot be attacked.`,
    );
  }

  return unit;
}

/**
 * Find a ready rival Unit with Blocker.
 *
 * Blocker is activated by spending the Unit.
 */
function findReadyBlocker(
  player: GameState["players"][PlayerId],
  instanceId: string,
): CardInstance {
  const blocker = player.field.find(
    (card) =>
      card.instanceId === instanceId &&
      card.card.kind === "unit",
  );

  if (!blocker) {
    throw new Error(
      `Blocker ${instanceId} is not in the rival field.`,
    );
  }

  if (!blocker.card.blocker) {
    throw new Error(
      `Unit ${instanceId} does not have Blocker.`,
    );
  }

  if (blocker.spent) {
    throw new Error(
      `Blocker ${instanceId} is already spent.`,
    );
  }

  if (blocker.lag) {
    throw new Error(
      `Blocker ${instanceId} has Lag and cannot use Blocker.`,
    );
  }

  return blocker;
}

/**
 * Remove a card from a player's field and put it in Trash.
 */
function defeatUnit(
  player: GameState["players"][PlayerId],
  unit: CardInstance,
) {
  const index = player.field.findIndex(
    (card) => card.instanceId === unit.instanceId,
  );

  if (index === -1) {
    throw new Error(
      `Cannot defeat Unit ${unit.instanceId}: it is not in the field.`,
    );
  }

  player.field.splice(index, 1);
  unit.spent = false;
  unit.lag = false;
  player.trash.push(unit);
}

/**
 * Return a Unit's current Power.
 *
 * Card-specific temporary modifiers will be added later.
 */
export function unitPower(unit: CardInstance): number {
  return unit.card.power ?? 0;
}

/**
 * Resolve a Unit-vs-Unit fight.
 *
 * The attacker and defender are already spent when this is called.
 */
function resolveFight(
  game: GameState,
  attackerPlayerId: PlayerId,
  attacker: CardInstance,
  defender: CardInstance,
): AttackResult {
  const defenderPlayerId = rivalOf(attackerPlayerId);

  const attackerPlayer = game.players[attackerPlayerId];
  const defenderPlayer = game.players[defenderPlayerId];

  const attackerPower = unitPower(attacker);
  const defenderPower = unitPower(defender);

  if (attackerPower > defenderPower) {
    defeatUnit(defenderPlayer, defender);

    return {
      type: "fight",
      attacker,
      defender,
      winner: attackerPlayerId,
    };
  }

  if (attackerPower < defenderPower) {
    defeatUnit(attackerPlayer, attacker);

    return {
      type: "fight",
      attacker,
      defender,
      winner: defenderPlayerId,
    };
  }

  /*
   * Equal Power defeats both Units.
   */
  defeatUnit(attackerPlayer, attacker);
  defeatUnit(defenderPlayer, defender);

  return {
    type: "fight",
    attacker,
    defender,
  };
}

/**
 * Attack a rival spent Unit.
 */
export function attackUnit(
  game: GameState,
  playerId: PlayerId,
  attackerInstanceId: string,
  defenderInstanceId: string,
): AttackResult {
  if (game.phase !== "main") {
    throw new Error("Attacks can only be made during the Main Phase.");
  }

  const attackerPlayer = game.players[playerId];
  const rivalId = rivalOf(playerId);
  const rivalPlayer = game.players[rivalId];

  const attacker = findFieldUnit(
    attackerPlayer,
    attackerInstanceId,
  );

  if (attacker.lag && !attacker.card.adrenaline) {
    throw new Error(
      `Unit ${attacker.instanceId} has Lag and cannot attack.`,
    );
  }

  if (attacker.spent) {
    throw new Error(
      `Unit ${attacker.instanceId} is already spent.`,
    );
  }

  const defender = findSpentRivalUnit(
    rivalPlayer,
    defenderInstanceId,
  );

  /*
   * Spend the attacker before resolving the fight.
   */
  attacker.spent = true;

  return resolveFight(
    game,
    playerId,
    attacker,
    defender,
  );
}

/**
 * Attack the rival Gig area.
 *
 * A Blocker may redirect this attack into a Unit-vs-Unit fight.
 *
 * Base steal: 1 Gig.
 * Additional steal: +1 for every 10 Power.
 * Power 0 steals 0.
 */
export function attackGigs(
  game: GameState,
  playerId: PlayerId,
  attackerInstanceId: string,
  blockerInstanceId?: string,
): AttackResult {
  if (game.phase !== "main") {
    throw new Error("Attacks can only be made during the Main Phase.");
  }

  const attackerPlayer = game.players[playerId];
  const rivalId = rivalOf(playerId);
  const rivalPlayer = game.players[rivalId];

  const attacker = findFieldUnit(
    attackerPlayer,
    attackerInstanceId,
  );

  if (attacker.lag && !attacker.card.adrenaline) {
    throw new Error(
      `Unit ${attacker.instanceId} has Lag and cannot attack.`,
    );
  }

  if (attacker.spent) {
    throw new Error(
      `Unit ${attacker.instanceId} is already spent.`,
    );
  }

  /*
   * Blocker redirects the attack before Gig theft is resolved.
   *
   * Both Units become spent as part of the interaction.
   */
  if (blockerInstanceId !== undefined) {
    const blocker = findReadyBlocker(
      rivalPlayer,
      blockerInstanceId,
    );

    attacker.spent = true;
    blocker.spent = true;

    /*
     * A redirected Gig attack becomes a normal fight.
     * No Gigs are stolen, regardless of the fight result.
     */
    return resolveFight(
      game,
      playerId,
      attacker,
      blocker,
    );
  }

  /*
   * Power 0 cannot steal any Gigs.
   */
  const power = unitPower(attacker);

  if (power <= 0) {
    attacker.spent = true;

    return {
      type: "steal",
      attacker,
      stolen: 0,
    };
  }

  const requestedSteal = 1 + Math.floor(power / 10);
  const stolen = Math.min(
    requestedSteal,
    rivalPlayer.gigs.length,
  );

  attacker.spent = true;

  for (let index = 0; index < stolen; index += 1) {
    const gig = rivalPlayer.gigs.shift();

    if (!gig) {
      break;
    }

    attackerPlayer.gigs.push(gig);
  }

  /*
   * The seven-Gig win condition is checked at the start of
   * the player's turn, not immediately after stealing a Gig.
   */
  return {
    type: "steal",
    attacker,
    stolen,
  };
}
