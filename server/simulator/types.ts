export type SimulatorCard = {
  id: number;
  name: string;
  kind: "legend" | "unit" | "gear" | "program";
  color: string;
  cost?: number;
  power?: number;
  ram: number;

  /**
   * Official card rules text from details.json.
   *
   * The simulator keeps this available for card-specific effect handling.
   */
  rulesText?: string;

  /**
   * Whether this Unit currently has Adrenaline.
   *
   * Adrenaline allows a Unit to ignore Lag when attacking.
   */
  adrenaline?: boolean;

  /**
   * Whether this card has the official Sell tag.
   */
  sellable?: boolean;

  /**
   * Whether this Unit currently has the official Blocker ability.
   *
   * This can represent either a printed Blocker ability or a temporary
   * effect that grants Blocker later.
   */
  blocker?: boolean;
};

export type PlayerId = 0 | 1;

export type Phase =
  | "setup"
  | "start"
  | "main"
  | "react"
  | "game-over";

export type GigDie =
  | "d4"
  | "d6"
  | "d8"
  | "d10"
  | "d12"
  | "d20";

export const GIG_DICE: readonly GigDie[] = [
  "d4",
  "d6",
  "d8",
  "d10",
  "d12",
  "d20",
];

export type CardZone =
  | "deck"
  | "hand"
  | "field"
  | "trash"
  | "legends"
  | "eddies";

export type CardInstance = {
  card: SimulatorCard;
  instanceId: string;
  spent: boolean;
  lag: boolean;
  faceUp?: boolean;
  equippedTo?: string;
};

export type Gig = {
  die: GigDie;
  value: number;
};

export type PendingAttack =
  | {
      type: "unit";
      attackerPlayerId: PlayerId;
      attackerInstanceId: string;
      defenderInstanceId: string;
    }
  | {
      type: "gigs";
      attackerPlayerId: PlayerId;
      attackerInstanceId: string;
    };

export type PlayerState = {
  id: PlayerId;

  deck: CardInstance[];
  hand: CardInstance[];
  field: CardInstance[];
  trash: CardInstance[];

  legends: CardInstance[];
  eddies: number;

  fixer: GigDie[];
  gigs: Gig[];

  hasSoldThisTurn: boolean;
  hasCalledLegendThisTurn: boolean;

  mulliganUsed: boolean;
};

export type GameState = {
  phase: Phase;

  turn: number;
  activePlayer: PlayerId;

  players: [PlayerState, PlayerState];

  firstPlayer: PlayerId;

  winner?: PlayerId;

  overtime: boolean;

  /**
   * Attack currently waiting for a React decision.
   */
  pendingAttack?: PendingAttack;
};
