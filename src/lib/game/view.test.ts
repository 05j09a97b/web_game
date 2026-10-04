import { describe, expect, it } from "vitest";
import { createWaitingGame, applyGameAction } from "./state-machine";
import { createPlayerGameView } from "./view";

function startedGame() {
  const waiting = createWaitingGame(
    [
      { id: "p1", nickname: "Mali" },
      { id: "p2", nickname: "Ton" },
    ],
    { gameId: "g1", hostPlayerId: "p1" },
  );
  const started = applyGameAction(
    waiting,
    { type: "start_game", playerId: "p1", expectedVersion: 0 },
    { random: () => 0 },
  );
  if (!started.ok) throw new Error("Test game should start.");
  return started.nextState;
}

describe("createPlayerGameView", () => {
  it("returns only the requesting player's hand and hides the pending card", () => {
    const state = startedGame();
    const selected = applyGameAction(state, {
      type: "select_card",
      playerId: "p1",
      cardId: state.players[0].hand[0].id,
      expectedVersion: state.version,
    });
    if (!selected.ok) throw new Error("Card should be selectable.");
    const targeted = applyGameAction(selected.nextState, {
      type: "select_target",
      playerId: "p1",
      targetPlayerId: "p2",
      expectedVersion: selected.nextState.version,
    });
    if (!targeted.ok) throw new Error("Target should be selectable.");
    const claimed = applyGameAction(targeted.nextState, {
      type: "select_claim",
      playerId: "p1",
      claim: "rat",
      expectedVersion: targeted.nextState.version,
    });
    if (!claimed.ok) throw new Error("Claim should be selectable.");

    const view = createPlayerGameView(claimed.nextState, "p2");
    expect(view?.ownHand).toEqual(claimed.nextState.players[1].hand);
    expect(view?.ownHand).not.toContainEqual(claimed.nextState.pendingTurn?.card);
    expect(view?.players.find(({ id }) => id === "p1")).not.toHaveProperty("hand");
    expect(view?.pendingClaim?.revealedCardType).toBeNull();
  });

  it("reveals the actual card only after the receiver responds", () => {
    const state = startedGame();
    const selected = applyGameAction(state, {
      type: "select_card",
      playerId: "p1",
      cardId: state.players[0].hand[0].id,
      expectedVersion: state.version,
    });
    if (!selected.ok) throw new Error("Card should be selectable.");
    const targeted = applyGameAction(selected.nextState, {
      type: "select_target",
      playerId: "p1",
      targetPlayerId: "p2",
      expectedVersion: selected.nextState.version,
    });
    if (!targeted.ok) throw new Error("Target should be selectable.");
    const claimed = applyGameAction(targeted.nextState, {
      type: "select_claim",
      playerId: "p1",
      claim: "rat",
      expectedVersion: targeted.nextState.version,
    });
    if (!claimed.ok) throw new Error("Claim should be selectable.");
    const response = applyGameAction(claimed.nextState, {
      type: "respond_to_challenge",
      playerId: "p2",
      response: "bluff",
      expectedVersion: claimed.nextState.version,
    });
    if (!response.ok) throw new Error("Receiver should be able to respond.");

    expect(createPlayerGameView(response.nextState, "p1")?.pendingClaim?.revealedCardType)
      .toBe(state.players[0].hand[0].type);
  });
});
