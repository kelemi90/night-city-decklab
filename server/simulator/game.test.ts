import { describe, expect, it } from "vitest";

import {
  checkImmediateWinner,
  gainGig,
  mulligan,
  setupGame,
  streetCred,
} from "./game";

import {
  callLegend,
  playGear,
  playProgram,
  playUnit,
  resetTurnActions,
  sellCard,
} from "./actions";

import type { SimulatorCard } from "./types";

function unit(
  id: number,
  overrides: Partial<SimulatorCard> = {},
): SimulatorCard {
  return {
    id,
    name: `Unit ${id}`,
    kind: "unit",
    color: "green",
    cost: 1,
    power: 2,
    ram: 1,
    sellable: true,
    ...overrides,
  };
}

function gear(id: number): SimulatorCard {
  return {
    id,
    name: `Gear ${id}`,
    kind: "gear",
    color: "green",
    cost: 2,
    ram: 1,
  };
}

function program(id: number): SimulatorCard {
  return {
    id,
    name: `Program ${id}`,
    kind: "program",
    color: "green",
    cost: 2,
    ram: 1,
  };
}

function legend(id: number): SimulatorCard {
  return {
    id,
    name: `Legend ${id}`,
    kind: "legend",
    color: "green",
    ram: 2,
  };
}

function deck(startId: number): SimulatorCard[] {
  return Array.from(
    { length: 40 },
    (_, index) => unit(startId + index),
  );
}

function legends(startId: number): SimulatorCard[] {
  return [
    legend(startId),
    legend(startId + 1),
    legend(startId + 2),
  ];
}

describe("Cyberpunk TCG simulator setup", () => {
  it("creates the official six-card opening hand", () => {
    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    expect(game.players[0].hand).toHaveLength(6);
    expect(game.players[1].hand).toHaveLength(6);

    expect(game.players[0].deck).toHaveLength(34);
    expect(game.players[1].deck).toHaveLength(34);
  });

  it("starts all six Gig dice in the Fixer", () => {
    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    expect(game.players[0].fixer).toEqual([
      "d4",
      "d6",
      "d8",
      "d10",
      "d12",
      "d20",
    ]);

    expect(game.players[1].fixer).toEqual([
      "d4",
      "d6",
      "d8",
      "d10",
      "d12",
      "d20",
    ]);
  });

  it("spends the first player's two leftmost Legends", () => {
    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    expect(game.players[0].legends[0].spent).toBe(true);
    expect(game.players[0].legends[1].spent).toBe(true);
    expect(game.players[0].legends[2].spent).toBe(false);

    expect(game.players[1].legends.every((card) => !card.spent)).toBe(true);
  });

  it("supports the first-turn player being player two", () => {
    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      1,
      () => 0.5,
    );

    expect(game.activePlayer).toBe(1);
    expect(game.firstPlayer).toBe(1);

    expect(game.players[1].legends[0].spent).toBe(true);
    expect(game.players[1].legends[1].spent).toBe(true);

    expect(game.players[0].legends.every((card) => !card.spent)).toBe(true);
  });

  it("allows one mulligan and redraws six cards", () => {
    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    mulligan(game, 0, () => 0.5);

    expect(game.players[0].hand).toHaveLength(6);
    expect(game.players[0].deck).toHaveLength(34);
    expect(game.players[0].mulliganUsed).toBe(true);

    const allCards = [
      ...game.players[0].hand,
      ...game.players[0].deck,
    ];

    expect(allCards).toHaveLength(40);

    expect(
      new Set(allCards.map((card) => card.instanceId)).size,
    ).toBe(40);
  });

  it("does not allow a second mulligan", () => {
    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    mulligan(game, 0, () => 0.5);

    expect(() =>
      mulligan(game, 0, () => 0.5),
    ).toThrow("already used their mulligan");
  });

  it("can gain a Gig from the Fixer", () => {
    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    gainGig(game, 0, "d6", () => 0.5);

    expect(game.players[0].fixer).toEqual([
      "d4",
      "d8",
      "d10",
      "d12",
      "d20",
    ]);

    expect(game.players[0].gigs).toHaveLength(1);
    expect(game.players[0].gigs[0]).toEqual({
      die: "d6",
      value: 4,
    });
  });

  it("does not allow the d20 before the other dice", () => {
    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    expect(() =>
      gainGig(game, 0, "d20", () => 0.5),
    ).toThrow("d20 is always taken last");
  });

  it("calculates Street Cred from Gig values", () => {
    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    gainGig(game, 0, "d4", () => 0);
    gainGig(game, 0, "d6", () => 0.5);
    gainGig(game, 0, "d8", () => 0.999);

    expect(streetCred(game.players[0])).toBe(1 + 4 + 8);
  });

  it("recognizes seven Gigs as an immediate victory", () => {
    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    game.players[0].gigs = [
      { die: "d4", value: 1 },
      { die: "d6", value: 2 },
      { die: "d8", value: 3 },
      { die: "d10", value: 4 },
      { die: "d12", value: 5 },
      { die: "d20", value: 6 },
      { die: "d4", value: 1 },
    ];

    expect(checkImmediateWinner(game)).toBe(0);
  });

  it("does not treat six Gigs as a victory", () => {
    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    game.players[0].gigs = [
      { die: "d4", value: 1 },
      { die: "d6", value: 2 },
      { die: "d8", value: 3 },
      { die: "d10", value: 4 },
      { die: "d12", value: 5 },
      { die: "d20", value: 6 },
    ];

    expect(checkImmediateWinner(game)).toBeUndefined();
  });
});

describe("Cyberpunk TCG turn engine", () => {
  it("moves the game from setup into the first Start Phase", () => {
    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    expect(game.turn).toBe(1);
    expect(game.activePlayer).toBe(0);
    expect(game.phase).toBe("start");
  });

  it("readies spent Legends at the beginning of a turn", async () => {
    const { startTurn } = await import("./turn");

    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    expect(game.players[0].legends[0].spent).toBe(true);
    expect(game.players[0].legends[1].spent).toBe(true);

    startTurn(game, "d4", () => 0);

    expect(game.players[0].legends[0].spent).toBe(false);
    expect(game.players[0].legends[1].spent).toBe(false);
    expect(game.players[0].legends[2].spent).toBe(false);
  });

  it("draws exactly one card during the Start Phase", async () => {
    const { startTurn } = await import("./turn");

    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    expect(game.players[0].hand).toHaveLength(6);

    startTurn(game, "d4", () => 0);

    expect(game.players[0].hand).toHaveLength(7);
  });

  it("gains the selected Gig during the Start Phase", async () => {
    const { startTurn } = await import("./turn");

    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    startTurn(game, "d6", () => 0.5);

    expect(game.players[0].gigs).toHaveLength(1);
    expect(game.players[0].gigs[0]).toEqual({
      die: "d6",
      value: 4,
    });

    expect(game.players[0].fixer).toEqual([
      "d4",
      "d8",
      "d10",
      "d12",
      "d20",
    ]);
  });

  it("enters Main Phase after a successful Start Phase", async () => {
    const { startTurn } = await import("./turn");

    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    startTurn(game, "d4", () => 0);

    expect(game.phase).toBe("main");
    expect(game.winner).toBeUndefined();
  });

  it("passes the turn to the opponent", async () => {
    const { endTurn, startTurn } = await import("./turn");

    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    startTurn(game, "d4", () => 0);

    expect(game.activePlayer).toBe(0);
    expect(game.turn).toBe(1);

    endTurn(game);

    expect(game.activePlayer).toBe(1);
    expect(game.turn).toBe(2);
    expect(game.phase).toBe("start");
  });

  it("can complete a full turn cycle", async () => {
    const { endTurn, startTurn } = await import("./turn");

    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    startTurn(game, "d4", () => 0);
    endTurn(game);

    startTurn(game, "d6", () => 0.5);

    expect(game.turn).toBe(2);
    expect(game.activePlayer).toBe(1);
    expect(game.phase).toBe("main");
    expect(game.players[1].hand).toHaveLength(7);
    expect(game.players[1].gigs).toHaveLength(1);
  });

  it("wins when starting a turn with seven Gigs", async () => {
    const { startTurn } = await import("./turn");

    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    game.players[0].gigs = [
      { die: "d4", value: 1 },
      { die: "d6", value: 2 },
      { die: "d8", value: 3 },
      { die: "d10", value: 4 },
      { die: "d12", value: 5 },
      { die: "d20", value: 6 },
      { die: "d4", value: 1 },
    ];

    const handBefore = game.players[0].hand.length;

    startTurn(game, "d6", () => 0);

    expect(game.winner).toBe(0);
    expect(game.phase).toBe("game-over");

    /*
     * Nothing in the Start Phase happens after the
     * win condition is detected.
     */
    expect(game.players[0].hand).toHaveLength(handBefore);
  });

  it("does not win merely by reaching seven Gigs during the Start Phase", async () => {
    const { startTurn } = await import("./turn");

    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    game.players[0].gigs = [
      { die: "d4", value: 1 },
      { die: "d6", value: 2 },
      { die: "d8", value: 3 },
      { die: "d10", value: 4 },
      { die: "d12", value: 5 },
      { die: "d20", value: 6 },
    ];

    startTurn(game, "d4", () => 0);

    expect(game.players[0].gigs).toHaveLength(7);
    expect(game.winner).toBeUndefined();
    expect(game.phase).toBe("main");
  });

  it("does not allow another turn after game over", async () => {
    const { startTurn } = await import("./turn");

    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "game-over";
    game.winner = 0;

    expect(() =>
      startTurn(game, "d4", () => 0),
    ).toThrow("already over");
  });

  it("recognizes cards with Lag as unable to attack", async () => {
    const { canAttack } = await import("./turn");

    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    const card = game.players[0].hand[0];

    card.lag = true;
    card.spent = false;

    expect(canAttack(card)).toBe(false);

    card.lag = false;

    expect(canAttack(card)).toBe(true);

    card.spent = true;

    expect(canAttack(card)).toBe(false);
  });
});

describe("Cyberpunk TCG Main Phase actions", () => {
  function createMainPhaseGame() {
    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    /*
     * Put the game directly into Main Phase.
     *
     * The action tests are concerned with action legality,
     * not Start Phase behaviour.
     */
    game.phase = "main";

    resetTurnActions(game.players[0]);

    return game;
  }

  it("can sell a Sell-tagged card for 1 €$", () => {
    const game = createMainPhaseGame();
    const player = game.players[0];

    const card = player.hand[0];
    const instanceId = card.instanceId;

    expect(player.eddies).toBe(0);
    expect(player.hand).toContain(card);

    sellCard(game, 0, instanceId);

    expect(player.eddies).toBe(1);
    expect(player.hand).not.toContain(card);
    expect(player.trash).not.toContain(card);
    expect(player.hasSoldThisTurn).toBe(true);
  });

  it("does not allow selling twice during one turn", () => {
    const game = createMainPhaseGame();
    const player = game.players[0];

    const first = player.hand[0];
    const second = player.hand[1];

    sellCard(game, 0, first.instanceId);

    expect(() =>
      sellCard(game, 0, second.instanceId),
    ).toThrow("already sold a card");
  });

  it("rejects selling a card without the Sell tag", () => {
    const game = createMainPhaseGame();
    const player = game.players[0];

    const unsellable: SimulatorCard = {
      id: 999,
      name: "Unsellable Test Card",
      kind: "unit",
      color: "green",
      cost: 1,
      power: 2,
      ram: 1,
      sellable: false,
    };

    player.hand[0].card = unsellable;

    expect(() =>
      sellCard(game, 0, player.hand[0].instanceId),
    ).toThrow("does not have a Sell tag");
  });

  it("plays a Unit and gives it Lag", () => {
    const game = createMainPhaseGame();
    const player = game.players[0];

    const card = player.hand[0];

    player.eddies = 1;

    playUnit(game, 0, card.instanceId);

    expect(player.eddies).toBe(0);
    expect(player.hand).not.toContain(card);
    expect(player.field).toContain(card);

    expect(card.spent).toBe(false);
    expect(card.lag).toBe(true);
  });

  it("rejects playing a Unit when the player cannot pay", () => {
    const game = createMainPhaseGame();
    const player = game.players[0];

    const card = player.hand[0];

    expect(player.eddies).toBe(0);
    expect(player.legends.every((legend) => legend.spent)).toBe(false);

    /*
     * The test card costs 1 and one unused Legend can technically
     * provide the resource, so spend all Legends first.
     */
    for (const legend of player.legends) {
      legend.spent = true;
    }

    expect(() =>
      playUnit(game, 0, card.instanceId),
    ).toThrow("cannot pay 1 €$");
  });

  it("can pay a Unit cost using a ready Legend", () => {
    const game = createMainPhaseGame();
    const player = game.players[0];

    const card = player.hand[0];

    player.eddies = 0;

    for (const legend of player.legends) {
      legend.spent = true;
    }

    /*
     * Make one Legend available as the resource source.
     */
    player.legends[2].spent = false;

    playUnit(game, 0, card.instanceId);

    expect(player.legends[2].spent).toBe(true);
    expect(player.field).toContain(card);
    expect(card.lag).toBe(true);
  });

  it("plays a Program and moves it directly to Trash", () => {
    const game = createMainPhaseGame();
    const player = game.players[0];

    const card = program(500);

    player.hand[0] = {
      ...player.hand[0],
      card,
    };

    player.eddies = 2;

    playProgram(game, 0, player.hand[0].instanceId);

    expect(player.eddies).toBe(0);
    expect(player.hand).toHaveLength(5);
    expect(player.trash).toHaveLength(1);
    expect(player.trash[0].card.id).toBe(500);
    expect(player.field).not.toContain(player.trash[0]);
  });

  it("plays Gear onto a friendly Unit", () => {
    const game = createMainPhaseGame();
    const player = game.players[0];

    const unitCard = player.hand[0];

    player.eddies = 1;

    playUnit(game, 0, unitCard.instanceId);

    const gearCard = gear(600);

    player.hand[0] = {
      ...player.hand[0],
      card: gearCard,
    };

    player.eddies = 2;

    const target = player.field[0];

    playGear(
      game,
      0,
      player.hand[0].instanceId,
      target.instanceId,
    );

    const equippedGear = player.field.find(
      (card) => card.card.id === 600,
    );

    expect(equippedGear).toBeDefined();
    expect(equippedGear?.equippedTo).toBe(
      target.instanceId,
    );
    expect(player.eddies).toBe(0);
  });

  it("can equip Gear to a face-down Legend", () => {
    const game = createMainPhaseGame();
    const player = game.players[0];

    const target = player.legends[2];

    target.faceUp = false;

    const gearCard = gear(601);

    player.hand[0] = {
      ...player.hand[0],
      card: gearCard,
    };

    player.eddies = 2;

    playGear(
      game,
      0,
      player.hand[0].instanceId,
      target.instanceId,
    );

    const equippedGear = player.field.find(
      (card) => card.card.id === 601,
    );

    expect(equippedGear).toBeDefined();
    expect(equippedGear?.equippedTo).toBe(
      target.instanceId,
    );
  });

  it("rejects Gear targeting an opponent's card", () => {
    const game = createMainPhaseGame();

    const player = game.players[0];
    const opponent = game.players[1];

    const gearCard = gear(602);

    player.hand[0] = {
      ...player.hand[0],
      card: gearCard,
    };

    player.eddies = 2;

    expect(() =>
      playGear(
        game,
        0,
        player.hand[0].instanceId,
        opponent.legends[0].instanceId,
      ),
    ).toThrow("not a valid friendly Gear target");
  });

  it("Calls one face-down Legend for 1 €$", () => {
    const game = createMainPhaseGame();
    const player = game.players[0];

    player.eddies = 1;

    expect(
      player.legends.filter((legend) => !legend.faceUp),
    ).toHaveLength(3);

    callLegend(game, 0, () => 0);

    expect(
      player.legends.filter((legend) => legend.faceUp),
    ).toHaveLength(1);

    expect(player.eddies).toBe(0);
    expect(player.hasCalledLegendThisTurn).toBe(true);
  });

  it("does not allow Calling a second Legend in the same turn", () => {
    const game = createMainPhaseGame();
    const player = game.players[0];

    player.eddies = 2;

    callLegend(game, 0, () => 0);

    expect(() =>
      callLegend(game, 0, () => 0),
    ).toThrow("already called a Legend");
  });

  it("rejects Calling a Legend without enough resources", () => {
    const game = createMainPhaseGame();
    const player = game.players[0];

    player.eddies = 0;

    for (const legend of player.legends) {
      legend.spent = true;
    }

    expect(() =>
      callLegend(game, 0, () => 0),
    ).toThrow("cannot pay 1 €$");
  });

  it("does not allow actions outside the Main Phase", () => {
    const game = createMainPhaseGame();
    const player = game.players[0];

    game.phase = "start";

    expect(() =>
      sellCard(game, 0, player.hand[0].instanceId),
    ).toThrow("Main Phase");

    expect(() =>
      playUnit(game, 0, player.hand[0].instanceId),
    ).toThrow("Main Phase");
  });
});

describe("Cyberpunk TCG combat", () => {
  function createCombatGame() {
    const game = setupGame(
      deck(1),
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    return game;
  }

  it("allows a ready Unit to attack a spent rival Unit", async () => {
    const { attackUnit } = await import("./combat");

    const game = createCombatGame();

    const attacker = game.players[0].hand[0];
    const defender = game.players[1].hand[0];

    attacker.card.power = 5;
    defender.card.power = 3;

    game.players[0].hand.shift();
    game.players[0].field.push(attacker);

    game.players[1].hand.shift();
    game.players[1].field.push(defender);

    defender.spent = true;

    const result = attackUnit(
      game,
      0,
      attacker.instanceId,
      defender.instanceId,
    );

    expect(result.type).toBe("fight");
    expect(result.winner).toBe(0);
    expect(attacker.spent).toBe(true);
    expect(game.players[0].field).toContain(attacker);
    expect(game.players[1].field).not.toContain(defender);
    expect(game.players[1].trash).toContain(defender);
  });

  it("cannot attack a ready rival Unit", async () => {
    const { attackUnit } = await import("./combat");

    const game = createCombatGame();

    const attacker = game.players[0].hand[0];
    const defender = game.players[1].hand[0];

    game.players[0].hand.shift();
    game.players[0].field.push(attacker);

    game.players[1].hand.shift();
    game.players[1].field.push(defender);

    expect(defender.spent).toBe(false);

    expect(() =>
      attackUnit(
        game,
        0,
        attacker.instanceId,
        defender.instanceId,
      ),
    ).toThrow("ready and cannot be attacked");
  });

  it("stronger Unit defeats the weaker Unit", async () => {
    const { attackUnit } = await import("./combat");

    const game = createCombatGame();

    const attacker = game.players[0].hand[0];
    const defender = game.players[1].hand[0];

    attacker.card.power = 10;
    defender.card.power = 4;

    game.players[0].hand.shift();
    game.players[0].field.push(attacker);

    game.players[1].hand.shift();
    game.players[1].field.push(defender);

    defender.spent = true;

    attackUnit(
      game,
      0,
      attacker.instanceId,
      defender.instanceId,
    );

    expect(game.players[0].field).toContain(attacker);
    expect(game.players[1].field).not.toContain(defender);
    expect(game.players[1].trash).toContain(defender);
  });

  it("weaker Unit is defeated by the stronger Unit", async () => {
    const { attackUnit } = await import("./combat");

    const game = createCombatGame();

    const attacker = game.players[0].hand[0];
    const defender = game.players[1].hand[0];

    attacker.card.power = 2;
    defender.card.power = 8;

    game.players[0].hand.shift();
    game.players[0].field.push(attacker);

    game.players[1].hand.shift();
    game.players[1].field.push(defender);

    defender.spent = true;

    const result = attackUnit(
      game,
      0,
      attacker.instanceId,
      defender.instanceId,
    );

    expect(result.winner).toBe(1);
    expect(game.players[0].field).not.toContain(attacker);
    expect(game.players[0].trash).toContain(attacker);
    expect(game.players[1].field).toContain(defender);
  });

  it("equal Power defeats both Units", async () => {
    const { attackUnit } = await import("./combat");

    const game = createCombatGame();

    const attacker = game.players[0].hand[0];
    const defender = game.players[1].hand[0];

    attacker.card.power = 5;
    defender.card.power = 5;

    game.players[0].hand.shift();
    game.players[0].field.push(attacker);

    game.players[1].hand.shift();
    game.players[1].field.push(defender);

    defender.spent = true;

    const result = attackUnit(
      game,
      0,
      attacker.instanceId,
      defender.instanceId,
    );

    expect(result.winner).toBeUndefined();
    expect(game.players[0].field).not.toContain(attacker);
    expect(game.players[1].field).not.toContain(defender);
    expect(game.players[0].trash).toContain(attacker);
    expect(game.players[1].trash).toContain(defender);
  });

  it("cannot attack with a spent Unit", async () => {
    const { attackGigs } = await import("./combat");

    const game = createCombatGame();
    const attacker = game.players[0].hand[0];

    game.players[0].hand.shift();
    game.players[0].field.push(attacker);

    attacker.spent = true;

    expect(() =>
      attackGigs(
        game,
        0,
        attacker.instanceId,
      ),
    ).toThrow("already spent");
  });

  it("cannot attack with a Unit that has Lag", async () => {
    const { attackGigs } = await import("./combat");

    const game = createCombatGame();
    const attacker = game.players[0].hand[0];

    game.players[0].hand.shift();
    game.players[0].field.push(attacker);

    attacker.lag = true;

    expect(() =>
      attackGigs(
        game,
        0,
        attacker.instanceId,
      ),
    ).toThrow("has Lag");
  });

  it("steals one Gig with a Power 1 Unit", async () => {
    const { attackGigs } = await import("./combat");

    const game = createCombatGame();

    const attacker = game.players[0].hand[0];

    game.players[0].hand.shift();
    game.players[0].field.push(attacker);

    attacker.card.power = 1;

    game.players[1].gigs = [
      { die: "d4", value: 2 },
      { die: "d6", value: 5 },
      { die: "d8", value: 8 },
    ];

    const result = attackGigs(
      game,
      0,
      attacker.instanceId,
    );

    expect(result.type).toBe("steal");
    expect(result.stolen).toBe(1);
    expect(game.players[0].gigs).toHaveLength(1);
    expect(game.players[1].gigs).toHaveLength(2);
    expect(attacker.spent).toBe(true);
  });

  it("steals two Gigs with a Power 10 Unit", async () => {
    const { attackGigs } = await import("./combat");

    const game = createCombatGame();

    const attacker = game.players[0].hand[0];

    game.players[0].hand.shift();
    game.players[0].field.push(attacker);

    attacker.card.power = 10;

    game.players[1].gigs = [
      { die: "d4", value: 2 },
      { die: "d6", value: 5 },
      { die: "d8", value: 8 },
    ];

    const result = attackGigs(
      game,
      0,
      attacker.instanceId,
    );

    expect(result.stolen).toBe(2);
    expect(game.players[0].gigs).toHaveLength(2);
    expect(game.players[1].gigs).toHaveLength(1);
  });

  it("steals three Gigs with a Power 20 Unit", async () => {
    const { attackGigs } = await import("./combat");

    const game = createCombatGame();

    const attacker = game.players[0].hand[0];

    game.players[0].hand.shift();
    game.players[0].field.push(attacker);

    attacker.card.power = 20;

    game.players[1].gigs = [
      { die: "d4", value: 2 },
      { die: "d6", value: 5 },
      { die: "d8", value: 8 },
      { die: "d10", value: 10 },
    ];

    const result = attackGigs(
      game,
      0,
      attacker.instanceId,
    );

    expect(result.stolen).toBe(3);
    expect(game.players[0].gigs).toHaveLength(3);
    expect(game.players[1].gigs).toHaveLength(1);
  });

  it("Power 0 steals zero Gigs", async () => {
    const { attackGigs } = await import("./combat");

    const game = createCombatGame();

    const attacker = game.players[0].hand[0];

    game.players[0].hand.shift();
    game.players[0].field.push(attacker);

    attacker.card.power = 0;

    game.players[1].gigs = [
      { die: "d4", value: 2 },
      { die: "d6", value: 5 },
    ];

    const result = attackGigs(
      game,
      0,
      attacker.instanceId,
    );

    expect(result.stolen).toBe(0);
    expect(game.players[0].gigs).toHaveLength(0);
    expect(game.players[1].gigs).toHaveLength(2);
    expect(attacker.spent).toBe(true);
  });

  it("cannot steal more Gigs than the rival owns", async () => {
    const { attackGigs } = await import("./combat");

    const game = createCombatGame();

    const attacker = game.players[0].hand[0];

    game.players[0].hand.shift();
    game.players[0].field.push(attacker);

    attacker.card.power = 30;

    game.players[1].gigs = [
      { die: "d4", value: 2 },
    ];

    const result = attackGigs(
      game,
      0,
      attacker.instanceId,
    );

    expect(result.stolen).toBe(1);
    expect(game.players[0].gigs).toHaveLength(1);
    expect(game.players[1].gigs).toHaveLength(0);
  });

  it("does not immediately declare victory after stealing the seventh Gig", async () => {
    const { attackGigs } = await import("./combat");

    const game = createCombatGame();

    const attacker = game.players[0].hand[0];

    game.players[0].hand.shift();
    game.players[0].field.push(attacker);

    attacker.card.power = 1;

    game.players[0].gigs = [
      { die: "d4", value: 2 },
      { die: "d6", value: 3 },
      { die: "d8", value: 4 },
      { die: "d10", value: 5 },
      { die: "d12", value: 6 },
      { die: "d20", value: 7 },
    ];

    game.players[1].gigs = [
      { die: "d4", value: 2 },
    ];

    attackGigs(
      game,
      0,
      attacker.instanceId,
    );

    expect(game.players[0].gigs).toHaveLength(7);
    expect(game.winner).toBeUndefined();
    expect(game.phase).toBe("main");
  });
});
describe("Cyberpunk TCG Blocker combat", () => {
  function takeCardById(
    player: {
      hand: Array<{ card: { id: number } }>;
      deck: Array<{ card: { id: number } }>;
    },
    cardId: number,
  ) {
    const handIndex = player.hand.findIndex(
      (card) => card.card.id === cardId,
    );

    if (handIndex !== -1) {
      return player.hand.splice(handIndex, 1)[0];
    }

    const deckIndex = player.deck.findIndex(
      (card) => card.card.id === cardId,
    );

    if (deckIndex !== -1) {
      return player.deck.splice(deckIndex, 1)[0];
    }

    throw new Error(`Test card ${cardId} was not found.`);
  }

  it("Blocker redirects a Gig attack into a fight", async () => {
    const { setupGame } = await import("./game");
    const { attackGigs } = await import("./combat");

    const game = setupGame(
      [
        unit(1, { power: 5 }),
        ...Array.from({ length: 39 }, (_, index) => unit(10 + index)),
      ],
      legends(100),
      [
        unit(200, { power: 3, blocker: true }),
        ...Array.from({ length: 39 }, (_, index) => unit(210 + index)),
      ],
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    const attacker = takeCardById(game.players[0], 1);
    const blocker = takeCardById(game.players[1], 200);

    game.players[0].field.push(attacker);
    game.players[1].field.push(blocker);

    const result = attackGigs(
      game,
      0,
      attacker.instanceId,
      blocker.instanceId,
    );

    expect(result.type).toBe("fight");
    expect(result.winner).toBe(0);

    expect(attacker.spent).toBe(true);
    expect(blocker.spent).toBe(false);

    expect(game.players[1].gigs).toHaveLength(0);
    expect(game.players[0].gigs).toHaveLength(0);
    expect(game.players[1].trash).toContain(blocker);
  });

  it("Blocker redirects the attack even when the Blocker wins", async () => {
    const { setupGame } = await import("./game");
    const { attackGigs } = await import("./combat");

    const game = setupGame(
      [
        unit(1, { power: 2 }),
        ...Array.from({ length: 39 }, (_, index) => unit(10 + index)),
      ],
      legends(100),
      [
        unit(200, { power: 8, blocker: true }),
        ...Array.from({ length: 39 }, (_, index) => unit(210 + index)),
      ],
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    const attacker = takeCardById(game.players[0], 1);
    const blocker = takeCardById(game.players[1], 200);

    game.players[0].field.push(attacker);
    game.players[1].field.push(blocker);

    const result = attackGigs(
      game,
      0,
      attacker.instanceId,
      blocker.instanceId,
    );

    expect(result.type).toBe("fight");
    expect(result.winner).toBe(1);

    expect(game.players[0].gigs).toHaveLength(0);
    expect(game.players[1].gigs).toHaveLength(0);

    expect(game.players[0].trash).toContain(attacker);
    expect(game.players[1].field).toContain(blocker);
    expect(blocker.spent).toBe(true);
  });

  it("equal Power destroys both the attacker and Blocker", async () => {
    const { setupGame } = await import("./game");
    const { attackGigs } = await import("./combat");

    const game = setupGame(
      [
        unit(1, { power: 5 }),
        ...Array.from({ length: 39 }, (_, index) => unit(10 + index)),
      ],
      legends(100),
      [
        unit(200, { power: 5, blocker: true }),
        ...Array.from({ length: 39 }, (_, index) => unit(210 + index)),
      ],
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    const attacker = takeCardById(game.players[0], 1);
    const blocker = takeCardById(game.players[1], 200);

    game.players[0].field.push(attacker);
    game.players[1].field.push(blocker);

    const result = attackGigs(
      game,
      0,
      attacker.instanceId,
      blocker.instanceId,
    );

    expect(result.type).toBe("fight");
    expect(result.winner).toBeUndefined();

    expect(game.players[0].trash).toContain(attacker);
    expect(game.players[1].trash).toContain(blocker);

    expect(game.players[0].gigs).toHaveLength(0);
    expect(game.players[1].gigs).toHaveLength(0);
  });

  it("cannot use a spent Unit as a Blocker", async () => {
    const { setupGame } = await import("./game");
    const { attackGigs } = await import("./combat");

    const game = setupGame(
      [
        unit(1, { power: 5 }),
        ...Array.from({ length: 39 }, (_, index) => unit(10 + index)),
      ],
      legends(100),
      [
        unit(200, { power: 3, blocker: true }),
        ...Array.from({ length: 39 }, (_, index) => unit(210 + index)),
      ],
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    const attacker = takeCardById(game.players[0], 1);
    const blocker = takeCardById(game.players[1], 200);

    attacker.spent = false;
    blocker.spent = true;

    game.players[0].field.push(attacker);
    game.players[1].field.push(blocker);

    expect(() =>
      attackGigs(
        game,
        0,
        attacker.instanceId,
        blocker.instanceId,
      ),
    ).toThrow("already spent");
  });

  it("cannot use a Unit without Blocker as a Blocker", async () => {
    const { setupGame } = await import("./game");
    const { attackGigs } = await import("./combat");

    const game = setupGame(
      [
        unit(1, { power: 5 }),
        ...Array.from({ length: 39 }, (_, index) => unit(10 + index)),
      ],
      legends(100),
      [
        unit(200, { power: 8, blocker: false }),
        ...Array.from({ length: 39 }, (_, index) => unit(210 + index)),
      ],
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    const attacker = takeCardById(game.players[0], 1);
    const nonBlocker = takeCardById(game.players[1], 200);

    game.players[0].field.push(attacker);
    game.players[1].field.push(nonBlocker);

    expect(() =>
      attackGigs(
        game,
        0,
        attacker.instanceId,
        nonBlocker.instanceId,
      ),
    ).toThrow("does not have Blocker");
  });

  it("a Gig attack without a Blocker still steals Gigs normally", async () => {
    const { setupGame } = await import("./game");
    const { attackGigs } = await import("./combat");

    const game = setupGame(
      [
        unit(1, { power: 10 }),
        ...Array.from({ length: 39 }, (_, index) => unit(10 + index)),
      ],
      legends(100),
      [
        ...Array.from({ length: 40 }, (_, index) => unit(200 + index)),
      ],
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    game.players[1].gigs = [
      { die: "d4", value: 2 },
      { die: "d6", value: 4 },
      { die: "d8", value: 6 },
    ];

    const attacker = takeCardById(game.players[0], 1);
    game.players[0].field.push(attacker);

    const result = attackGigs(
      game,
      0,
      attacker.instanceId,
    );

    expect(result.type).toBe("steal");
    expect(result.stolen).toBe(2);

    expect(game.players[0].gigs).toHaveLength(2);
    expect(game.players[1].gigs).toHaveLength(1);
  });
});

describe("Cyberpunk TCG React window", () => {
  function takeCardById(
    player: {
      hand: Array<{ card: { id: number } }>;
      deck: Array<{ card: { id: number } }>;
    },
    cardId: number,
  ) {
    const handIndex = player.hand.findIndex(
      (card) => card.card.id === cardId,
    );

    if (handIndex !== -1) {
      return player.hand.splice(handIndex, 1)[0];
    }

    const deckIndex = player.deck.findIndex(
      (card) => card.card.id === cardId,
    );

    if (deckIndex !== -1) {
      return player.deck.splice(deckIndex, 1)[0];
    }

    throw new Error(`Test card ${cardId} was not found.`);
  }

  it("opens a React window for a Gig attack", async () => {
    const { setupGame } = await import("./game");
    const {
      beginReactWindow,
      getReactPlayer,
      getReactActions,
    } = await import("./react");

    const game = setupGame(
      [
        unit(1, { power: 5 }),
        ...Array.from({ length: 39 }, (_, index) =>
          unit(10 + index),
        ),
      ],
      legends(100),
      [
        unit(200, { power: 3, blocker: true }),
        ...Array.from({ length: 39 }, (_, index) =>
          unit(210 + index),
        ),
      ],
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    const attacker = takeCardById(game.players[0], 1);

    game.players[0].field.push(attacker);

    beginReactWindow(game, {
      type: "gigs",
      attackerPlayerId: 0,
      attackerInstanceId: attacker.instanceId,
    });

    expect(game.phase).toBe("react");
    expect(getReactPlayer(game)).toBe(1);

    expect(getReactActions(game)).toEqual([
      { type: "pass" },
    ]);
  });

  it("offers a ready Blocker during the React window", async () => {
    const { setupGame } = await import("./game");
    const {
      beginReactWindow,
      getAvailableBlockers,
      getReactActions,
      useBlocker,
    } = await import("./react");

    const game = setupGame(
      [
        unit(1, { power: 5 }),
        ...Array.from({ length: 39 }, (_, index) =>
          unit(10 + index),
        ),
      ],
      legends(100),
      [
        unit(200, { power: 3, blocker: true }),
        ...Array.from({ length: 39 }, (_, index) =>
          unit(210 + index),
        ),
      ],
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    const attacker = takeCardById(game.players[0], 1);
    const blocker = takeCardById(game.players[1], 200);

    game.players[0].field.push(attacker);
    game.players[1].field.push(blocker);

    beginReactWindow(game, {
      type: "gigs",
      attackerPlayerId: 0,
      attackerInstanceId: attacker.instanceId,
    });

    expect(getAvailableBlockers(game)).toContain(blocker);

    expect(getReactActions(game)).toContainEqual({
      type: "blocker",
      blockerInstanceId: blocker.instanceId,
    });

    useBlocker(game, blocker.instanceId);

    expect(blocker.spent).toBe(true);
  });

  it("does not offer spent or lagged Blockers", async () => {
    const { setupGame } = await import("./game");
    const {
      beginReactWindow,
      getAvailableBlockers,
    } = await import("./react");

    const game = setupGame(
      [
        unit(1),
        ...Array.from({ length: 39 }, (_, index) =>
          unit(10 + index),
        ),
      ],
      legends(100),
      [
        unit(200, { blocker: true }),
        ...Array.from({ length: 39 }, (_, index) =>
          unit(210 + index),
        ),
      ],
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    const attacker = takeCardById(game.players[0], 1);
    const blocker = takeCardById(game.players[1], 200);

    game.players[0].field.push(attacker);
    game.players[1].field.push(blocker);

    beginReactWindow(game, {
      type: "gigs",
      attackerPlayerId: 0,
      attackerInstanceId: attacker.instanceId,
    });

    blocker.spent = true;

    expect(getAvailableBlockers(game)).toHaveLength(0);

    blocker.spent = false;
    blocker.lag = true;

    expect(getAvailableBlockers(game)).toHaveLength(0);
  });

  it("allows the defender to pass the React window", async () => {
    const { setupGame } = await import("./game");
    const {
      beginReactWindow,
      passReact,
    } = await import("./react");

    const game = setupGame(
      [
        unit(1),
        ...Array.from({ length: 39 }, (_, index) =>
          unit(10 + index),
        ),
      ],
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    const attacker = takeCardById(game.players[0], 1);

    game.players[0].field.push(attacker);

    beginReactWindow(game, {
      type: "gigs",
      attackerPlayerId: 0,
      attackerInstanceId: attacker.instanceId,
    });

    passReact(game);

    expect(game.phase).toBe("main");
    expect(game.pendingAttack).toBeUndefined();
  });

  it("declares a Unit attack and resolves it after React passes", async () => {
    const { setupGame } = await import("./game");
    const {
      declareUnitAttack,
      resolvePendingAttack,
    } = await import("./combat");
    const { passReact } = await import("./react");

    const game = setupGame(
      [
        unit(1, { power: 10 }),
        ...Array.from({ length: 39 }, (_, index) =>
          unit(10 + index),
        ),
      ],
      legends(100),
      [
        unit(200, { power: 3 }),
        ...Array.from({ length: 39 }, (_, index) =>
          unit(210 + index),
        ),
      ],
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    const attacker = takeCardById(game.players[0], 1);
    const defender = takeCardById(game.players[1], 200);

    defender.spent = true;

    game.players[0].field.push(attacker);
    game.players[1].field.push(defender);

    declareUnitAttack(
      game,
      0,
      attacker.instanceId,
      defender.instanceId,
    );

    expect(game.phase).toBe("react");
    expect(game.pendingAttack).toEqual({
      type: "unit",
      attackerPlayerId: 0,
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: defender.instanceId,
    });
    expect(attacker.spent).toBe(true);

    const pendingAttack = passReact(game);

    const result = resolvePendingAttack(
      game,
      pendingAttack,
    );

    expect(result.type).toBe("fight");
    expect(result.winner).toBe(0);
    expect(game.players[1].field).not.toContain(defender);
    expect(game.players[1].trash).toContain(defender);
    expect(game.phase).toBe("main");
  });

  it("declares a Gig attack and resolves Gig theft after React passes", async () => {
    const { setupGame } = await import("./game");
    const {
      declareGigAttack,
      resolvePendingAttack,
    } = await import("./combat");
    const { passReact } = await import("./react");

    const game = setupGame(
      [
        unit(1, { power: 10 }),
        ...Array.from({ length: 39 }, (_, index) =>
          unit(10 + index),
        ),
      ],
      legends(100),
      deck(200),
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    const attacker = takeCardById(game.players[0], 1);

    game.players[0].field.push(attacker);

    game.players[1].gigs = [
      { die: "d4", value: 2 },
      { die: "d6", value: 4 },
      { die: "d8", value: 6 },
    ];

    declareGigAttack(
      game,
      0,
      attacker.instanceId,
    );

    expect(game.phase).toBe("react");
    expect(game.pendingAttack).toEqual({
      type: "gigs",
      attackerPlayerId: 0,
      attackerInstanceId: attacker.instanceId,
    });
    expect(attacker.spent).toBe(true);

    const pendingAttack = passReact(game);

    const result = resolvePendingAttack(
      game,
      pendingAttack,
    );

    expect(result.type).toBe("steal");
    expect(result.stolen).toBe(2);
    expect(game.players[0].gigs).toHaveLength(2);
    expect(game.players[1].gigs).toHaveLength(1);
    expect(game.phase).toBe("main");
  });

  it("allows a Blocker to redirect a declared Gig attack", async () => {
    const { setupGame } = await import("./game");
    const {
      declareGigAttack,
      resolvePendingAttack,
    } = await import("./combat");
    const {
      getAvailableBlockers,
      passReact,
      useBlocker,
    } = await import("./react");

    const game = setupGame(
      [
        unit(1, { power: 5 }),
        ...Array.from({ length: 39 }, (_, index) =>
          unit(10 + index),
        ),
      ],
      legends(100),
      [
        unit(200, { power: 3, blocker: true }),
        ...Array.from({ length: 39 }, (_, index) =>
          unit(210 + index),
        ),
      ],
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    const attacker = takeCardById(game.players[0], 1);
    const blocker = takeCardById(game.players[1], 200);

    game.players[0].field.push(attacker);
    game.players[1].field.push(blocker);

    game.players[1].gigs = [
      { die: "d4", value: 2 },
      { die: "d6", value: 4 },
    ];

    declareGigAttack(
      game,
      0,
      attacker.instanceId,
    );

    expect(game.phase).toBe("react");
    expect(getAvailableBlockers(game)).toContain(blocker);

    useBlocker(game, blocker.instanceId);

    const pendingAttack = passReact(game);

    const result = resolvePendingAttack(
      game,
      pendingAttack,
      blocker.instanceId,
    );

    expect(result.type).toBe("fight");
    expect(result.winner).toBe(0);

    expect(game.players[0].gigs).toHaveLength(0);
    expect(game.players[1].gigs).toHaveLength(2);
    expect(game.players[0].field).toContain(attacker);
    expect(game.players[0].trash).not.toContain(attacker);
    expect(game.players[1].field).not.toContain(blocker);
    expect(game.players[1].trash).toContain(blocker);
    expect(game.phase).toBe("main");
  });

  it("does not steal Gigs when a Blocker wins the redirected fight", async () => {
    const { setupGame } = await import("./game");
    const {
      declareGigAttack,
      resolvePendingAttack,
    } = await import("./combat");
    const {
      passReact,
      useBlocker,
    } = await import("./react");

    const game = setupGame(
      [
        unit(1, { power: 3 }),
        ...Array.from({ length: 39 }, (_, index) =>
          unit(10 + index),
        ),
      ],
      legends(100),
      [
        unit(200, { power: 10, blocker: true }),
        ...Array.from({ length: 39 }, (_, index) =>
          unit(210 + index),
        ),
      ],
      legends(300),
      0,
      () => 0.5,
    );

    game.phase = "main";

    const attacker = takeCardById(game.players[0], 1);
    const blocker = takeCardById(game.players[1], 200);

    game.players[0].field.push(attacker);
    game.players[1].field.push(blocker);

    game.players[1].gigs = [
      { die: "d4", value: 2 },
      { die: "d6", value: 4 },
    ];

    declareGigAttack(
      game,
      0,
      attacker.instanceId,
    );

    useBlocker(game, blocker.instanceId);

    const pendingAttack = passReact(game);

    const result = resolvePendingAttack(
      game,
      pendingAttack,
      blocker.instanceId,
    );

    expect(result.type).toBe("fight");
    expect(result.winner).toBe(1);
    expect(game.players[0].gigs).toHaveLength(0);
    expect(game.players[1].gigs).toHaveLength(2);
  });


});

describe("Cyberpunk TCG baseline simulation", () => {
  it("can progress through turns and steal Gigs", async () => {
    const { simulateGame } = await import("./simulation");

    const unit = (
      id: number,
      power: number,
    ): SimulatorCard => ({
      id,
      name: `Unit ${id}`,
      kind: "unit",
      color: "red",
      cost: 0,
      power,
      ram: 1,
    });

    const legend = (id: number): SimulatorCard => ({
      id,
      name: `Legend ${id}`,
      kind: "legend",
      color: "red",
      ram: 1,
    });

    const result = simulateGame({
      player0Cards: Array.from(
        { length: 50 },
        (_, i) => unit(i + 1, 10),
      ),
      player0Legends: [
        legend(100),
        legend(101),
        legend(102),
      ],
      player1Cards: Array.from(
        { length: 50 },
        (_, i) => unit(i + 201, 0),
      ),
      player1Legends: [
        legend(300),
        legend(301),
        legend(302),
      ],
      random: () => 0.5,
      maxTurns: 100,
    });

    expect(result.gameOver).toBe(true);
    expect(result.winner).toBe(0);
    expect(result.turns).toBeGreaterThan(0);

    expect(result.finalGigs[0]).toBeGreaterThanOrEqual(7);
    expect(result.finalGigs[1]).toBeLessThan(7);

    expect(result.stats.attacks[0]).toBeGreaterThan(0);
    expect(result.stats.gigSteals[0]).toBeGreaterThan(0);
    expect(result.stats.cardsPlayed[0]).toBeGreaterThan(0);
    expect(result.stats.cardsPlayed[1]).toBeGreaterThan(0);
  });
});

describe("Cyberpunk TCG batch simulation", () => {
  it("runs reproducible batches of games", async () => {
    const { simulateGames } = await import("./simulation");

    const unit = (
      id: number,
      power: number,
    ): SimulatorCard => ({
      id,
      name: `Unit ${id}`,
      kind: "unit",
      color: "red",
      cost: 0,
      power,
      ram: 1,
    });

    const legend = (id: number): SimulatorCard => ({
      id,
      name: `Legend ${id}`,
      kind: "legend",
      color: "red",
      ram: 1,
    });

    const options = {
      player0Cards: Array.from(
        { length: 50 },
        (_, i) => unit(i + 1, 10),
      ),
      player0Legends: [
        legend(100),
        legend(101),
        legend(102),
      ],
      player1Cards: Array.from(
        { length: 50 },
        (_, i) => unit(i + 201, 0),
      ),
      player1Legends: [
        legend(300),
        legend(301),
        legend(302),
      ],
      maxTurns: 100,
    };

    const first = simulateGames(options, {
      games: 100,
      seed: 12345,
    });

    const second = simulateGames(options, {
      games: 100,
      seed: 12345,
    });

    expect(first).toEqual(second);

    expect(first.games).toBe(100);
    expect(first.player0Wins).toBe(100);
    expect(first.player1Wins).toBe(0);
    expect(first.unfinishedGames).toBe(0);

    expect(first.player0WinRate).toBe(1);
    expect(first.player1WinRate).toBe(0);

    expect(first.averageTurns).toBeGreaterThan(0);
    expect(first.totalAttacks[0]).toBeGreaterThan(0);
    expect(first.totalGigSteals[0]).toBeGreaterThan(0);
  });
});
