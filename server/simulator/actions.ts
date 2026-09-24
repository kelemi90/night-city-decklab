import type {
  CardInstance,
  GameState,
  PlayerId,
} from "./types";

/**
 * Return the cost of a card.
 *
 * Simulator cards without an explicit cost are treated as cost 0.
 */
function cardCost(card: CardInstance): number {
  return card.card.cost ?? 0;
}

/**
 * Pay a resource cost.
 *
 * Eddies are spent first. If more resources are required,
 * ready/face-down Legends may be spent as 1 €$ each.
 *
 * Legends are not moved anywhere when spent.
 */
function payCost(
  player: GameState["players"][PlayerId],
  cost: number,
) {
  if (cost < 0) {
    throw new Error("Card cost cannot be negative.");
  }

  const availableLegendResources = player.legends.filter(
    (legend) => !legend.spent,
  ).length;

  if (player.eddies + availableLegendResources < cost) {
    throw new Error(
      `Player ${player.id} cannot pay ${cost} €$.`,
    );
  }

  const eddiesToSpend = Math.min(player.eddies, cost);

  player.eddies -= eddiesToSpend;

  let remaining = cost - eddiesToSpend;

  if (remaining > 0) {
    for (const legend of player.legends) {
      if (remaining === 0) {
        break;
      }

      if (legend.spent) {
        continue;
      }

      legend.spent = true;
      remaining -= 1;
    }
  }
}

/**
 * Find a card in the player's hand.
 */
function findHandCard(
  player: GameState["players"][PlayerId],
  instanceId: string,
): CardInstance {
  const index = player.hand.findIndex(
    (card) => card.instanceId === instanceId,
  );

  if (index === -1) {
    throw new Error(
      `Card ${instanceId} is not in player ${player.id}'s hand.`,
    );
  }

  return player.hand[index];
}

/**
 * Remove a card from the player's hand.
 */
function removeFromHand(
  player: GameState["players"][PlayerId],
  instanceId: string,
): CardInstance {
  const index = player.hand.findIndex(
    (card) => card.instanceId === instanceId,
  );

  if (index === -1) {
    throw new Error(
      `Card ${instanceId} is not in player ${player.id}'s hand.`,
    );
  }

  const [card] = player.hand.splice(index, 1);

  return card;
}

/**
 * Sell one card from hand for 1 €$.
 *
 * Selling is limited to once per turn.
 */
export function sellCard(
  game: GameState,
  playerId: PlayerId,
  instanceId: string,
) {
  if (game.phase !== "main") {
    throw new Error("Cards can only be sold during the Main Phase.");
  }

  const player = game.players[playerId];

  if (player.hasSoldThisTurn) {
    throw new Error(
      `Player ${playerId} has already sold a card this turn.`,
    );
  }

  const card = findHandCard(player, instanceId);

  if (!card.card.sellable) {
    throw new Error(
      `Card ${card.card.name} does not have a Sell tag.`,
    );
  }

  removeFromHand(player, instanceId);

  /*
   * A sold card becomes a face-down Eddie.
   * The simulator represents the Eddies area as a numeric
   * resource pool, so the physical card itself no longer
   * needs to remain in another zone.
   */
  player.eddies += 1;
  player.hasSoldThisTurn = true;
}

/**
 * Play a Unit.
 *
 * Units enter the Field with Lag.
 */
export function playUnit(
  game: GameState,
  playerId: PlayerId,
  instanceId: string,
) {
  if (game.phase !== "main") {
    throw new Error("Units can only be played during the Main Phase.");
  }

  const player = game.players[playerId];
  const card = findHandCard(player, instanceId);

  if (card.card.kind !== "unit") {
    throw new Error(
      `Card ${card.card.name} is not a Unit.`,
    );
  }

  payCost(player, cardCost(card));

  const unit = removeFromHand(player, instanceId);

  unit.spent = false;
  unit.lag = true;
  unit.faceUp = true;

  player.field.push(unit);
}

/**
 * Play a Gear onto a friendly Unit or face-up Legend.
 */
export function playGear(
  game: GameState,
  playerId: PlayerId,
  instanceId: string,
  targetInstanceId: string,
) {
  if (game.phase !== "main") {
    throw new Error("Gear can only be played during the Main Phase.");
  }

  const player = game.players[playerId];
  const card = findHandCard(player, instanceId);

  if (card.card.kind !== "gear") {
    throw new Error(
      `Card ${card.card.name} is not Gear.`,
    );
  }

  const target = findFriendlyEquipTarget(
    player,
    targetInstanceId,
  );

  payCost(player, cardCost(card));

  const gear = removeFromHand(player, instanceId);

  gear.spent = false;
  gear.lag = false;
  gear.faceUp = true;
  gear.equippedTo = target.instanceId;

  player.field.push(gear);
}

/**
 * Play a Program.
 *
 * The card is paid for and immediately moved to Trash.
 * Card-specific effects will be implemented later.
 */
export function playProgram(
  game: GameState,
  playerId: PlayerId,
  instanceId: string,
) {
  if (game.phase !== "main") {
    throw new Error(
      "Programs can only be played during the Main Phase.",
    );
  }

  const player = game.players[playerId];
  const card = findHandCard(player, instanceId);

  if (card.card.kind !== "program") {
    throw new Error(
      `Card ${card.card.name} is not a Program.`,
    );
  }

  payCost(player, cardCost(card));

  const program = removeFromHand(player, instanceId);

  program.spent = false;
  program.lag = false;
  program.faceUp = true;

  player.trash.push(program);
}

/**
 * Call a Legend.
 *
 * One face-down Legend is selected at random and flipped face-up.
 * Calling costs 1 €$ and is limited to once per turn.
 */
export function callLegend(
  game: GameState,
  playerId: PlayerId,
  random: () => number = Math.random,
) {
  if (game.phase !== "main") {
    throw new Error(
      "A Legend can only be called during the Main Phase.",
    );
  }

  const player = game.players[playerId];

  if (player.hasCalledLegendThisTurn) {
    throw new Error(
      `Player ${playerId} has already called a Legend this turn.`,
    );
  }

  const faceDown = player.legends.filter(
    (legend) => !legend.faceUp,
  );

  if (faceDown.length === 0) {
    throw new Error(
      `Player ${playerId} has no face-down Legends to Call.`,
    );
  }

  payCost(player, 1);

  const index = Math.floor(random() * faceDown.length);
  const legend = faceDown[index];

  legend.faceUp = true;
  player.hasCalledLegendThisTurn = true;
}

/**
 * Find a valid Gear target.
 *
 * Gear may be equipped to:
 * - a friendly Unit
 * - a friendly Legend
 *
 * A Legend does not need to be face-up to receive Gear.
 */
function findFriendlyEquipTarget(
  player: GameState["players"][PlayerId],
  instanceId: string,
): CardInstance {
  const unit = player.field.find(
    (card) =>
      card.instanceId === instanceId &&
      card.card.kind === "unit",
  );

  if (unit) {
    return unit;
  }

  const legend = player.legends.find(
    (card) =>
      card.instanceId === instanceId &&
      card.card.kind === "legend",
  );

  if (legend) {
    return legend;
  }

  throw new Error(
    `Card ${instanceId} is not a valid friendly Gear target.`,
  );
}

/**
 * Reset once-per-turn Main Phase actions.
 *
 * Called when a new turn begins.
 */
export function resetTurnActions(
  player: GameState["players"][PlayerId],
) {
  player.hasSoldThisTurn = false;
  player.hasCalledLegendThisTurn = false;
}

/**
 * Finish the turn's Lag.
 *
 * The official rules state that Unit Lag lasts until the end
 * of the turn.
 */
export function clearLag(
  player: GameState["players"][PlayerId],
) {
  for (const card of player.field) {
    if (card.card.kind === "unit") {
      card.lag = false;
    }
  }
}
