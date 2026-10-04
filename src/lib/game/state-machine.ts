import { createDeck, dealCards, DEFAULT_CARDS_PER_PLAYER } from "./deck";
import { checkLoseCondition, determineNextPlayer, isCardType, resolveChallenge } from "./rules";
import { findPlayer, phaseError, validateActionVersion, validateCurrentPlayer } from "./validation";
import type {
  GameAction,
  GameActionResult,
  GameError,
  GameEvent,
  GameSetupOptions,
  GameState,
  PlayerSetup,
  PlayerState,
  StartGameOptions,
} from "./types";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;

export function createWaitingGame(
  playerSetups: readonly PlayerSetup[],
  { gameId = "game-1", hostPlayerId = playerSetups[0]?.id }: GameSetupOptions = {},
): GameState {
  if (playerSetups.length < 1 || playerSetups.length > MAX_PLAYERS) {
    throw new RangeError(`A waiting game must have between 1 and ${MAX_PLAYERS} players.`);
  }
  if (new Set(playerSetups.map(({ id }) => id)).size !== playerSetups.length) {
    throw new RangeError("Player IDs must be unique.");
  }
  if (!hostPlayerId || !playerSetups.some(({ id }) => id === hostPlayerId)) {
    throw new RangeError("The host must be one of the players in the game.");
  }

  const players: PlayerState[] = playerSetups.map(({ id, nickname, connected = true }) => ({
    id,
    nickname,
    hand: [],
    penaltyCards: [],
    connected,
  }));

  return {
    id: gameId,
    hostPlayerId,
    phase: "waiting",
    version: 0,
    turnNumber: 0,
    currentPlayerId: null,
    nextPlayerId: null,
    players,
    drawPile: [],
    pendingTurn: null,
    lastResolution: null,
    gameOver: null,
  };
}

export function applyGameAction(
  state: GameState,
  action: GameAction,
  startOptions: StartGameOptions = {},
): GameActionResult {
  const staleActionError = validateActionVersion(state, action);
  if (staleActionError) {
    return reject(state, staleActionError);
  }

  switch (action.type) {
    case "start_game":
      return startGame(state, action, startOptions);
    case "select_card":
      return selectCard(state, action);
    case "select_target":
      return selectTarget(state, action);
    case "select_claim":
      return selectClaim(state, action);
    case "respond_to_challenge":
      return respondToChallenge(state, action);
    case "resolve_challenge":
      return resolveChallengeAction(state, action);
    case "finish_resolution":
      return finishResolution(state, action);
    case "advance_turn":
      return advanceTurn(state, action);
  }
}

function startGame(
  state: GameState,
  action: Extract<GameAction, { type: "start_game" }>,
  { cardsPerPlayer = DEFAULT_CARDS_PER_PLAYER, random }: StartGameOptions,
): GameActionResult {
  if (state.phase !== "waiting") {
    return reject(state, phaseError("waiting"));
  }
  if (!findPlayer(state, action.playerId)) {
    return reject(state, { code: "player_not_found", message: "Player is not part of this game." });
  }
  if (action.playerId !== state.hostPlayerId) {
    return reject(state, { code: "not_host", message: "Only the host can start the game." });
  }
  if (
    state.players.length < MIN_PLAYERS ||
    state.players.length > MAX_PLAYERS ||
    !Number.isInteger(cardsPerPlayer) ||
    cardsPerPlayer < 1
  ) {
    return reject(state, {
      code: "game_not_startable",
      message: "The game needs 2–8 players and a positive hand size to start.",
    });
  }

  const deck = createDeck({ random });
  let deal;
  try {
    deal = dealCards(state.players, deck, cardsPerPlayer);
  } catch (error) {
    return reject(state, {
      code: "game_not_startable",
      message: error instanceof Error ? error.message : "Cards could not be dealt.",
    });
  }

  const players = state.players.map((player) => ({
    ...player,
    hand: deal.hands[player.id],
  }));
  const nextState: GameState = {
    ...state,
    players,
    drawPile: deal.remainingDeck,
    phase: "select_card",
    version: state.version + 1,
    turnNumber: 1,
    currentPlayerId: players[0].id,
    nextPlayerId: null,
    pendingTurn: null,
    lastResolution: null,
    gameOver: null,
  };

  return accept(nextState, [
    {
      type: "game_started",
      firstPlayerId: players[0].id,
      dealtCardCount: cardsPerPlayer,
    },
    { type: "turn_started", playerId: players[0].id, turnNumber: 1 },
  ]);
}

function selectCard(
  state: GameState,
  action: Extract<GameAction, { type: "select_card" }>,
): GameActionResult {
  if (state.phase !== "select_card") {
    return reject(state, phaseError("select_card"));
  }
  const turnError = validateCurrentPlayer(state, action.playerId);
  if (turnError) return reject(state, turnError);

  const player = findPlayer(state, action.playerId);
  const card = player?.hand.find(({ id }) => id === action.cardId);
  if (!card) {
    return reject(state, {
      code: "card_not_owned",
      message: "The selected card is not in this player's hand.",
    });
  }

  const nextState: GameState = {
    ...state,
    phase: "select_target",
    version: state.version + 1,
    pendingTurn: {
      senderId: action.playerId,
      card,
      targetPlayerId: null,
      claim: null,
      response: null,
    },
  };
  return accept(nextState, [{ type: "card_selected", playerId: action.playerId }]);
}

function selectTarget(
  state: GameState,
  action: Extract<GameAction, { type: "select_target" }>,
): GameActionResult {
  if (state.phase !== "select_target") {
    return reject(state, phaseError("select_target"));
  }
  const turnError = validateCurrentPlayer(state, action.playerId);
  if (turnError) return reject(state, turnError);
  if (!state.players.some(({ id }) => id === action.targetPlayerId)) {
    return reject(state, {
      code: "invalid_target",
      message: "The target must be a player in this game.",
    });
  }
  if (action.targetPlayerId === action.playerId) {
    return reject(state, {
      code: "invalid_target",
      message: "A player cannot target themselves.",
    });
  }
  if (!state.pendingTurn) {
    return reject(state, phaseError("a selected card"));
  }

  return accept(
    {
      ...state,
      phase: "select_claim",
      version: state.version + 1,
      pendingTurn: { ...state.pendingTurn, targetPlayerId: action.targetPlayerId },
    },
    [],
  );
}

function selectClaim(
  state: GameState,
  action: Extract<GameAction, { type: "select_claim" }>,
): GameActionResult {
  if (state.phase !== "select_claim") {
    return reject(state, phaseError("select_claim"));
  }
  const turnError = validateCurrentPlayer(state, action.playerId);
  if (turnError) return reject(state, turnError);
  if (!state.pendingTurn?.targetPlayerId) {
    return reject(state, phaseError("a selected target"));
  }
  const targetPlayerId = state.pendingTurn.targetPlayerId;
  if (!isCardType(action.claim)) {
    return reject(state, {
      code: "invalid_claim",
      message: "The claim must be one of the configured card types.",
    });
  }

  const sender = findPlayer(state, action.playerId);
  const cardIndex = sender?.hand.findIndex(({ id }) => id === state.pendingTurn?.card.id) ?? -1;
  if (!sender || cardIndex < 0) {
    return reject(state, {
      code: "card_not_owned",
      message: "The selected card is no longer in this player's hand.",
    });
  }

  const players = state.players.map((player) =>
    player.id === sender.id
      ? { ...player, hand: player.hand.filter(({ id }) => id !== state.pendingTurn?.card.id) }
      : player,
  );
  const pendingTurn = { ...state.pendingTurn, targetPlayerId, claim: action.claim };
  const nextState: GameState = {
    ...state,
    players,
    phase: "waiting_response",
    version: state.version + 1,
    pendingTurn,
  };

  return accept(nextState, [
    {
      type: "card_played",
      senderId: pendingTurn.senderId,
      receiverId: pendingTurn.targetPlayerId,
      claim: action.claim,
    },
  ]);
}

function respondToChallenge(
  state: GameState,
  action: Extract<GameAction, { type: "respond_to_challenge" }>,
): GameActionResult {
  if (state.phase !== "waiting_response") {
    return reject(state, phaseError("waiting_response"));
  }
  const pending = state.pendingTurn;
  if (!pending?.targetPlayerId || !pending.claim) {
    return reject(state, phaseError("a pending claim"));
  }
  if (!findPlayer(state, action.playerId)) {
    return reject(state, { code: "player_not_found", message: "Player is not part of this game." });
  }
  if (action.playerId !== pending.targetPlayerId) {
    return reject(state, {
      code: "not_your_turn",
      message: "Only the player receiving the card can respond.",
    });
  }
  if (action.response !== "true" && action.response !== "bluff") {
    return reject(state, {
      code: "invalid_response",
      message: "The response must be true or bluff.",
    });
  }

  const pendingTurn = {
    ...pending,
    targetPlayerId: pending.targetPlayerId,
    claim: pending.claim,
    response: action.response,
  };
  const nextState: GameState = {
    ...state,
    phase: "reveal",
    version: state.version + 1,
    pendingTurn,
  };
  return accept(nextState, [
    {
      type: "card_revealed",
      senderId: pendingTurn.senderId,
      receiverId: pendingTurn.targetPlayerId,
      claim: pendingTurn.claim,
      actualCardType: pendingTurn.card.type,
      response: action.response,
    },
  ]);
}

function resolveChallengeAction(
  state: GameState,
  action: Extract<GameAction, { type: "resolve_challenge" }>,
): GameActionResult {
  if (state.phase !== "reveal") {
    return reject(state, phaseError("reveal"));
  }
  const pending = state.pendingTurn;
  if (!pending?.targetPlayerId || !pending.claim || !pending.response) {
    return reject(state, phaseError("a revealed challenge"));
  }
  if (action.playerId !== pending.targetPlayerId) {
    return reject(state, {
      code: "not_your_turn",
      message: "Only the player who responded can resolve this challenge.",
    });
  }

  const result = resolveChallenge({
    claim: pending.claim,
    actualCard: pending.card,
    response: pending.response,
    senderId: pending.senderId,
    receiverId: pending.targetPlayerId,
  });
  const penaltyOwner = findPlayer(state, result.penaltyOwnerId);
  if (!penaltyOwner) {
    return reject(state, { code: "player_not_found", message: "Penalty owner was not found." });
  }

  const updatedPenaltyCards = [...penaltyOwner.penaltyCards, pending.card];
  const players = state.players.map((player) =>
    player.id === penaltyOwner.id ? { ...player, penaltyCards: updatedPenaltyCards } : player,
  );
  const lostCardType = checkLoseCondition(updatedPenaltyCards);
  const resolution = {
    claim: pending.claim,
    actualCard: pending.card,
    response: pending.response,
    responseWasCorrect: result.responseWasCorrect,
    penaltyOwnerId: result.penaltyOwnerId,
    lostCardType,
  } as const;

  if (lostCardType) {
    const gameOver = {
      reason: "four_of_a_kind" as const,
      loserPlayerId: penaltyOwner.id,
      cardType: lostCardType,
    };
    return accept(
      {
        ...state,
        players,
        phase: "resolve",
        version: state.version + 1,
        lastResolution: resolution,
        gameOver,
      },
      [
        {
          type: "challenge_resolved",
          responseWasCorrect: result.responseWasCorrect,
          penaltyOwnerId: penaltyOwner.id,
          cardType: pending.card.type,
        },
        { type: "player_lost", playerId: penaltyOwner.id, cardType: lostCardType },
      ],
    );
  }

  return accept(
    {
      ...state,
      players,
      phase: "resolve",
      version: state.version + 1,
      lastResolution: resolution,
    },
    [
      {
        type: "challenge_resolved",
        responseWasCorrect: result.responseWasCorrect,
        penaltyOwnerId: penaltyOwner.id,
        cardType: pending.card.type,
      },
    ],
  );
}

function finishResolution(
  state: GameState,
  action: Extract<GameAction, { type: "finish_resolution" }>,
): GameActionResult {
  if (state.phase !== "resolve") {
    return reject(state, phaseError("resolve"));
  }
  const pending = state.pendingTurn;
  if (!pending?.targetPlayerId) {
    return reject(state, phaseError("a resolved challenge"));
  }
  if (action.playerId !== pending.targetPlayerId) {
    return reject(state, {
      code: "not_your_turn",
      message: "Only the player who responded can finish the challenge resolution.",
    });
  }
  if (state.gameOver) {
    return accept(
      { ...state, phase: "game_over", version: state.version + 1 },
      [{ type: "game_finished", gameOver: state.gameOver }],
    );
  }

  const nextPlayerId = determineNextPlayer(state.players, pending.senderId);
  if (!nextPlayerId) {
    const gameOver = { reason: "no_cards" as const, loserPlayerId: null, cardType: null };
    return accept(
      { ...state, phase: "game_over", version: state.version + 1, gameOver },
      [{ type: "game_finished", gameOver }],
    );
  }

  return accept(
    { ...state, phase: "next_turn", version: state.version + 1, nextPlayerId },
    [],
  );
}

function advanceTurn(
  state: GameState,
  action: Extract<GameAction, { type: "advance_turn" }>,
): GameActionResult {
  if (state.phase !== "next_turn") {
    return reject(state, phaseError("next_turn"));
  }
  if (!state.nextPlayerId || action.playerId !== state.nextPlayerId) {
    return reject(state, {
      code: "not_your_turn",
      message: "Only the next player can begin their turn.",
    });
  }

  const nextState: GameState = {
    ...state,
    phase: "select_card",
    version: state.version + 1,
    turnNumber: state.turnNumber + 1,
    currentPlayerId: state.nextPlayerId,
    nextPlayerId: null,
    pendingTurn: null,
    lastResolution: null,
  };
  return accept(nextState, [
    { type: "turn_started", playerId: action.playerId, turnNumber: nextState.turnNumber },
  ]);
}

function accept(nextState: GameState, events: GameEvent[]): GameActionResult {
  return { ok: true, nextState, events };
}

function reject(nextState: GameState, error: GameError): GameActionResult {
  return { ok: false, nextState, events: [], error };
}
