export const CARD_TYPES = [
  "bug",
  "rat",
  "bat",
  "spider",
  "frog",
  "fly",
  "scorpion",
  "snake",
] as const;

export type CardType = (typeof CARD_TYPES)[number];
export type PlayerId = string;
export type CardId = string;
export type GameId = string;

export interface Card {
  id: CardId;
  type: CardType;
}

export interface PlayerSetup {
  id: PlayerId;
  nickname: string;
  connected?: boolean;
}

export interface PlayerState {
  id: PlayerId;
  nickname: string;
  hand: Card[];
  penaltyCards: Card[];
  connected: boolean;
}

export interface PublicPlayer {
  id: PlayerId;
  nickname: string;
  cardCount: number;
  penaltyCards: Card[];
  connected: boolean;
}

export interface PlayerGameView {
  gameId: GameId;
  phase: GamePhase;
  version: number;
  turnNumber: number;
  currentPlayerId: PlayerId | null;
  nextPlayerId: PlayerId | null;
  players: PublicPlayer[];
  ownHand: Card[];
  pendingClaim: {
    senderId: PlayerId;
    receiverId: PlayerId;
    claim: CardType;
    revealedCardType: CardType | null;
    response: ChallengeResponse | null;
  } | null;
  lastResolution: ChallengeResolution | null;
  gameOver: GameOver | null;
}

export type GamePhase =
  | "waiting"
  | "select_card"
  | "select_target"
  | "select_claim"
  | "waiting_response"
  | "reveal"
  | "resolve"
  | "next_turn"
  | "game_over";

export type ChallengeResponse = "true" | "bluff";

export interface PendingTurn {
  senderId: PlayerId;
  card: Card;
  targetPlayerId: PlayerId | null;
  claim: CardType | null;
  response: ChallengeResponse | null;
}

export interface ChallengeResolution {
  claim: CardType;
  actualCard: Card;
  response: ChallengeResponse;
  responseWasCorrect: boolean;
  penaltyOwnerId: PlayerId;
  lostCardType: CardType | null;
}

export interface GameOver {
  reason: "four_of_a_kind" | "no_cards";
  loserPlayerId: PlayerId | null;
  cardType: CardType | null;
}

export interface GameState {
  id: GameId;
  hostPlayerId: PlayerId;
  phase: GamePhase;
  version: number;
  turnNumber: number;
  currentPlayerId: PlayerId | null;
  nextPlayerId: PlayerId | null;
  players: PlayerState[];
  drawPile: Card[];
  pendingTurn: PendingTurn | null;
  lastResolution: ChallengeResolution | null;
  gameOver: GameOver | null;
}

export type GameAction =
  | { type: "start_game"; playerId: PlayerId; expectedVersion: number }
  | {
      type: "select_card";
      playerId: PlayerId;
      cardId: CardId;
      expectedVersion: number;
    }
  | {
      type: "select_target";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      expectedVersion: number;
    }
  | {
      type: "select_claim";
      playerId: PlayerId;
      claim: CardType;
      expectedVersion: number;
    }
  | {
      type: "respond_to_challenge";
      playerId: PlayerId;
      response: ChallengeResponse;
      expectedVersion: number;
    }
  | {
      type: "resolve_challenge";
      playerId: PlayerId;
      expectedVersion: number;
    }
  | {
      type: "finish_resolution";
      playerId: PlayerId;
      expectedVersion: number;
    }
  | {
      type: "advance_turn";
      playerId: PlayerId;
      expectedVersion: number;
    };

export type GameErrorCode =
  | "stale_action"
  | "invalid_phase"
  | "player_not_found"
  | "not_host"
  | "not_your_turn"
  | "card_not_owned"
  | "invalid_target"
  | "invalid_claim"
  | "game_not_startable"
  | "invalid_response";

export interface GameError {
  code: GameErrorCode;
  message: string;
}

export type GameEvent =
  | { type: "game_started"; firstPlayerId: PlayerId; dealtCardCount: number }
  | { type: "card_selected"; playerId: PlayerId }
  | {
      type: "card_played";
      senderId: PlayerId;
      receiverId: PlayerId;
      claim: CardType;
    }
  | {
      type: "card_revealed";
      senderId: PlayerId;
      receiverId: PlayerId;
      claim: CardType;
      actualCardType: CardType;
      response: ChallengeResponse;
    }
  | {
      type: "challenge_resolved";
      responseWasCorrect: boolean;
      penaltyOwnerId: PlayerId;
      cardType: CardType;
    }
  | {
      type: "player_lost";
      playerId: PlayerId;
      cardType: CardType;
    }
  | { type: "turn_started"; playerId: PlayerId; turnNumber: number }
  | { type: "game_finished"; gameOver: GameOver };

export type GameActionResult =
  | { ok: true; nextState: GameState; events: GameEvent[] }
  | { ok: false; nextState: GameState; events: []; error: GameError };

export interface GameSetupOptions {
  gameId?: GameId;
  hostPlayerId?: PlayerId;
}

export interface StartGameOptions {
  cardsPerPlayer?: number;
  random?: () => number;
}
