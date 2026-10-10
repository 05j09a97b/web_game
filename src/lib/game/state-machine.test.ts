import { describe, expect, it } from "vitest";
import { applyGameAction, createWaitingGame } from "./state-machine";
import { createPlayerGameView } from "./view";
import type { CardType, GameAction, GameState, PlayerSetup } from "./types";

type WithoutVersion<Action> = Action extends { expectedVersion: number }
  ? Omit<Action, "expectedVersion">
  : never;

const playerSetups: PlayerSetup[] = [
  { id: "p1", nickname: "Ari" },
  { id: "p2", nickname: "Bo" },
  { id: "p3", nickname: "Cam" },
];

const fourPlayerSetups: PlayerSetup[] = [
  ...playerSetups,
  { id: "p4", nickname: "Dee" },
];

function run(state: GameState, action: WithoutVersion<GameAction>): GameState {
  const result = applyGameAction(state, { ...action, expectedVersion: state.version } as GameAction, {
    random: () => 0.5,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.nextState;
}

function startedGame(players = playerSetups): GameState {
  const waiting = createWaitingGame(players, { gameId: "test-game", hostPlayerId: "p1" });
  return run(waiting, { type: "start_game", playerId: "p1" });
}

function prepareResponse(state: GameState, claim?: CardType) {
  const currentPlayer = state.players.find(({ id }) => id === state.currentPlayerId);
  if (!currentPlayer) throw new Error("Current player missing from test state.");
  const card = currentPlayer.hand[0];
  const receiverId = state.players.find(({ id }) => id !== currentPlayer.id)?.id;
  if (!receiverId) throw new Error("Test needs another player.");

  let next = run(state, { type: "select_card", playerId: currentPlayer.id, cardId: card.id });
  next = run(next, { type: "select_target", playerId: currentPlayer.id, targetPlayerId: receiverId });
  next = run(next, {
    type: "select_claim",
    playerId: currentPlayer.id,
    claim: claim ?? card.type,
  });
  return { state: next, card, senderId: currentPlayer.id, receiverId };
}

describe("game state machine", () => {
  it("deals all 64 cards to four players, 16 cards each", () => {
    const waiting = createWaitingGame(fourPlayerSetups, {
      gameId: "four-player-game",
      hostPlayerId: "p1",
    });
    const result = applyGameAction(
      waiting,
      { type: "start_game", playerId: "p1", expectedVersion: waiting.version },
      { random: () => 0.5 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dealtCards = result.nextState.players.flatMap(({ hand }) => hand);
    expect(result.nextState.players.map(({ hand }) => hand.length)).toEqual([16, 16, 16, 16]);
    expect(dealtCards).toHaveLength(64);
    expect(new Set(dealtCards.map(({ id }) => id)).size).toBe(64);
    expect(result.nextState.drawPile).toEqual([]);
    expect(result.events[0]).toEqual({
      type: "game_started",
      firstPlayerId: "p1",
      totalCardsDealt: 64,
    });
  });

  it("deals cards at start and advances through a valid turn", () => {
    const state = startedGame();

    expect(state.phase).toBe("select_card");
    expect(state.currentPlayerId).toBe("p1");
    expect(state.players.map(({ hand }) => hand.length)).toEqual([22, 21, 21]);
    expect(state.drawPile).toEqual([]);

    const { state: waitingResponse, card, receiverId } = prepareResponse(state);
    expect(waitingResponse.phase).toBe("waiting_response");
    expect(waitingResponse.players[0].hand).not.toContainEqual(card);
    expect(waitingResponse.pendingTurn?.card).toEqual(card);

    const revealed = run(waitingResponse, {
      type: "respond_to_challenge",
      playerId: receiverId,
      response: "true",
    });
    expect(revealed.phase).toBe("reveal");
    expect(revealed.lastResolution).toBeNull();

    const resolving = run(revealed, { type: "resolve_challenge", playerId: receiverId });
    expect(resolving.phase).toBe("resolve");
    expect(resolving.lastResolution?.responseWasCorrect).toBe(true);
    expect(resolving.lastResolution?.penaltyOwnerId).toBe("p1");
    expect(resolving.players[0].penaltyCards).toContainEqual(card);

    const resolved = run(resolving, { type: "finish_resolution", playerId: receiverId });
    expect(resolved.phase).toBe("next_turn");
    expect(resolved.lastResolution?.responseWasCorrect).toBe(true);
    expect(resolved.lastResolution?.penaltyOwnerId).toBe("p1");

    const next = run(resolved, { type: "advance_turn", playerId: "p2" });
    expect(next.phase).toBe("select_card");
    expect(next.currentPlayerId).toBe("p2");
    expect(next.turnNumber).toBe(2);
  });

  it("rejects an action in the wrong phase without changing state", () => {
    const state = startedGame();
    const result = applyGameAction(state, {
      type: "select_target",
      playerId: "p1",
      targetPlayerId: "p2",
      expectedVersion: state.version,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_phase");
      expect(result.nextState).toBe(state);
    }
  });

  it("rejects cards owned by another player and out-of-turn actions", () => {
    const state = startedGame();
    const otherPlayerCard = state.players[1].hand[0];
    const notOwned = applyGameAction(state, {
      type: "select_card",
      playerId: "p1",
      cardId: otherPlayerCard.id,
      expectedVersion: state.version,
    });
    const outOfTurn = applyGameAction(state, {
      type: "select_card",
      playerId: "p2",
      cardId: state.players[1].hand[0].id,
      expectedVersion: state.version,
    });

    expect(notOwned.ok).toBe(false);
    if (!notOwned.ok) expect(notOwned.error.code).toBe("card_not_owned");
    expect(outOfTurn.ok).toBe(false);
    if (!outOfTurn.ok) expect(outOfTurn.error.code).toBe("not_your_turn");
  });

  it("rejects invalid targets and stale actions", () => {
    const state = startedGame();
    const selected = run(state, {
      type: "select_card",
      playerId: "p1",
      cardId: state.players[0].hand[0].id,
    });
    const invalidTarget = applyGameAction(selected, {
      type: "select_target",
      playerId: "p1",
      targetPlayerId: "missing",
      expectedVersion: selected.version,
    });
    const staleAction = applyGameAction(state, {
      type: "select_card",
      playerId: "p1",
      cardId: state.players[0].hand[0].id,
      expectedVersion: state.version - 1,
    });

    expect(invalidTarget.ok).toBe(false);
    if (!invalidTarget.ok) expect(invalidTarget.error.code).toBe("invalid_target");
    expect(staleAction.ok).toBe(false);
    if (!staleAction.ok) expect(staleAction.error.code).toBe("stale_action");
  });

  it("allows only the host to start and requires at least two players", () => {
    const state = createWaitingGame(playerSetups);
    const nonHost = applyGameAction(state, {
      type: "start_game",
      playerId: "p2",
      expectedVersion: state.version,
    });
    const solo = createWaitingGame([{ id: "p1", nickname: "Ari" }]);
    const cannotStartSolo = applyGameAction(solo, {
      type: "start_game",
      playerId: "p1",
      expectedVersion: solo.version,
    });

    expect(nonHost.ok).toBe(false);
    if (!nonHost.ok) expect(nonHost.error.code).toBe("not_host");
    expect(cannotStartSolo.ok).toBe(false);
    if (!cannotStartSolo.ok) expect(cannotStartSolo.error.code).toBe("game_not_startable");
  });

  it("ends the game when a player receives their fourth matching penalty card", () => {
    let state = startedGame();
    const current = state.players[0];
    const card = current.hand[0];
    state = {
      ...state,
      players: state.players.map((player) =>
        player.id === current.id
          ? {
              ...player,
              penaltyCards: Array.from({ length: 3 }, (_, index) => ({
                id: `${card.type}-penalty-${index}`,
                type: card.type,
              })),
            }
          : player,
      ),
    };
    const { state: waitingResponse, receiverId } = prepareResponse(state, card.type);
    const revealed = run(waitingResponse, {
      type: "respond_to_challenge",
      playerId: receiverId,
      response: "true",
    });
    const resolving = run(revealed, { type: "resolve_challenge", playerId: receiverId });
    const ended = run(resolving, { type: "finish_resolution", playerId: receiverId });

    expect(ended.phase).toBe("game_over");
    expect(ended.gameOver).toEqual({
      reason: "four_of_a_kind",
      loserPlayerId: "p1",
      cardType: card.type,
    });
  });

  it("ends cleanly when every player's hand runs out", () => {
    let state = startedGame(playerSetups.slice(0, 2));
    state = {
      ...state,
      players: state.players.map((player) => ({ ...player, hand: player.hand.slice(0, 1) })),
    };

    const firstPlay = prepareResponse(state);
    const firstReveal = run(firstPlay.state, {
      type: "respond_to_challenge",
      playerId: firstPlay.receiverId,
      response: "true",
    });
    const firstResolution = run(firstReveal, {
      type: "resolve_challenge",
      playerId: firstPlay.receiverId,
    });
    const firstNextTurn = run(firstResolution, {
      type: "finish_resolution",
      playerId: firstPlay.receiverId,
    });
    const secondTurn = run(firstNextTurn, { type: "advance_turn", playerId: "p2" });

    const secondPlay = prepareResponse(secondTurn);
    const secondReveal = run(secondPlay.state, {
      type: "respond_to_challenge",
      playerId: secondPlay.receiverId,
      response: "true",
    });
    const secondResolution = run(secondReveal, {
      type: "resolve_challenge",
      playerId: secondPlay.receiverId,
    });
    const ended = run(secondResolution, {
      type: "finish_resolution",
      playerId: secondPlay.receiverId,
    });

    expect(ended.phase).toBe("game_over");
    expect(ended.gameOver).toEqual({ reason: "no_cards", loserPlayerId: null, cardType: null });
  });

  it("does not expose hidden hands or the pending card before reveal", () => {
    const state = startedGame();
    const { state: waitingResponse, card, receiverId } = prepareResponse(state);
    const receiverView = createPlayerGameView(waitingResponse, receiverId);

    expect(receiverView?.ownHand).toEqual(waitingResponse.players[1].hand);
    expect(receiverView?.players[0]).not.toHaveProperty("hand");
    expect(receiverView?.players[0].cardCount).toBe(21);
    expect(receiverView?.pendingClaim?.revealedCardType).toBeNull();
    expect(receiverView?.pendingClaim?.revealedCardType).not.toBe(card.type);

    const strangerView = createPlayerGameView(waitingResponse, "stranger");
    expect(strangerView).toBeNull();
  });
});
