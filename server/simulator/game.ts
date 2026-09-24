import {
  GIG_DICE,
  type CardInstance,
  type Gig,
  type GigDie,
  type GameState,
  type PlayerId,
  type PlayerState,
  type SimulatorCard,
} from "./types";

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));

    [result[index], result[swapIndex]] = [
      result[swapIndex],
      result[index],
    ];
  }

  return result;
}

function createInstance(
  card: SimulatorCard,
  instanceId: string,
): CardInstance {
  return {
    card,
    instanceId,
    spent: false,
    lag: false,
    faceUp: card.kind !== "legend",
  };
}

function createPlayer(
  id: PlayerId,
  cards: SimulatorCard[],
  legends: SimulatorCard[],
  random: () => number,
): PlayerState {
  if (legends.length !== 3) {
    throw new Error("A player must have exactly 3 Legends.");
  }

  const uniqueLegendNames = new Set(legends.map((legend) => legend.name));

  if (uniqueLegendNames.size !== 3) {
    throw new Error("A player's Legends must have unique names.");
  }

  if (cards.length < 40 || cards.length > 50) {
    throw new Error(
      `A player's main deck must contain 40–50 cards; received ${cards.length}.`,
    );
  }

  const deck = shuffle(
    cards.map((card, index) =>
      createInstance(card, `p${id}-deck-${index}`),
    ),
    random,
  );

  const legendInstances = shuffle(
    legends.map((legend, index) =>
      createInstance(legend, `p${id}-legend-${index}`),
    ),
    random,
  );

  return {
    id,

    deck,
    hand: [],
    field: [],
    trash: [],

    legends: legendInstances,
    eddies: 0,

    fixer: [...GIG_DICE],
    gigs: [],

    hasSoldThisTurn: false,
    hasCalledLegendThisTurn: false,

    mulliganUsed: false,
  };
}

export function drawCards(player: PlayerState, count: number) {
  if (player.deck.length < count) {
    throw new Error(
      `Player ${player.id} attempted to draw ${count} cards with only ${player.deck.length} cards remaining.`,
    );
  }

  for (let index = 0; index < count; index += 1) {
    const card = player.deck.shift();

    if (!card) {
      throw new Error("Deck unexpectedly became empty while drawing.");
    }

    player.hand.push(card);
  }
}

function prepareFirstPlayer(player: PlayerState) {
  if (player.legends.length !== 3) {
    throw new Error("Player must have exactly 3 Legends.");
  }

  /*
   * Official Beta setup:
   *
   * The player going first spends their two leftmost Legends
   * and doesn't ready them on their first turn.
   *
   * The Legends are randomized during setup, so "leftmost"
   * refers to the randomized order.
   */
  player.legends[0].spent = true;
  player.legends[1].spent = true;
}

export function setupGame(
  player0Cards: SimulatorCard[],
  player0Legends: SimulatorCard[],
  player1Cards: SimulatorCard[],
  player1Legends: SimulatorCard[],
  firstPlayer: PlayerId = 0,
  random: () => number = Math.random,
): GameState {
  const players: [PlayerState, PlayerState] = [
    createPlayer(0, player0Cards, player0Legends, random),
    createPlayer(1, player1Cards, player1Legends, random),
  ];

  const game: GameState = {
    phase: "setup",

    turn: 0,
    activePlayer: firstPlayer,

    players,

    firstPlayer,

    overtime: false,
  };

  /*
   * Each player draws six cards.
   */
  drawCards(players[0], 6);
  drawCards(players[1], 6);

  /*
   * The first player starts with their two leftmost Legends spent.
   */
  prepareFirstPlayer(players[firstPlayer]);

  /*
   * Turn 1 belongs to the first player.
   */
  game.turn = 1;
  game.phase = "start";

  return game;
}

export function mulligan(
  game: GameState,
  playerId: PlayerId,
  random: () => number = Math.random,
) {
  const player = game.players[playerId];

  if (player.mulliganUsed) {
    throw new Error(`Player ${playerId} has already used their mulligan.`);
  }

  if (player.hand.length !== 6) {
    throw new Error(
      `Player ${playerId} must have exactly 6 cards to mulligan.`,
    );
  }

  const oldHand = [...player.hand];

  player.hand = [];

  player.deck = shuffle(
    [...player.deck, ...oldHand],
    random,
  );

  drawCards(player, 6);

  player.mulliganUsed = true;
}

export function gigDieSides(die: GigDie): number {
  switch (die) {
    case "d4":
      return 4;
    case "d6":
      return 6;
    case "d8":
      return 8;
    case "d10":
      return 10;
    case "d12":
      return 12;
    case "d20":
      return 20;
  }
}

export function rollGig(
  die: GigDie,
  random: () => number = Math.random,
): Gig {
  const sides = gigDieSides(die);

  return {
    die,
    value: Math.floor(random() * sides) + 1,
  };
}

export function gainGig(
  game: GameState,
  playerId: PlayerId,
  die: GigDie,
  random: () => number = Math.random,
) {
  const player = game.players[playerId];

  const index = player.fixer.indexOf(die);

  if (die === "d20") {
    const otherDiceRemain = player.fixer.some((fixerDie) => fixerDie !== "d20");

    if (otherDiceRemain) {
      throw new Error("The d20 is always taken last.");
    }
  }

  if (index === -1) {
    throw new Error(`Player ${playerId} does not have ${die} in the Fixer.`);
  }

  player.fixer.splice(index, 1);
  player.gigs.push(rollGig(die, random));
}

export function streetCred(player: PlayerState): number {
  return player.gigs.reduce(
    (total, gig) => total + gig.value,
    0,
  );
}

export function checkImmediateWinner(
  game: GameState,
): PlayerId | undefined {
  for (const player of game.players) {
    if (player.gigs.length >= 7) {
      return player.id;
    }
  }

  return undefined;
}
