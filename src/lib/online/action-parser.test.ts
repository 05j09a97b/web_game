import { describe, expect, it } from "vitest";
import { parseClientGameAction } from "./action-parser";

describe("parseClientGameAction", () => {
  it("always uses the authenticated player ID instead of a client-supplied ID", () => {
    expect(
      parseClientGameAction(
        { type: "select_card", cardId: "rat-1", playerId: "forged-player", expectedVersion: 7 },
        "verified-player",
      ),
    ).toEqual({
      type: "select_card",
      cardId: "rat-1",
      playerId: "verified-player",
      expectedVersion: 7,
    });
  });

  it("rejects unsupported actions, invalid versions, claims, and responses", () => {
    expect(parseClientGameAction({ type: "start_game", expectedVersion: 0 }, "p1")).toBeNull();
    expect(parseClientGameAction({ type: "advance_turn", expectedVersion: -1 }, "p1")).toBeNull();
    expect(parseClientGameAction({ type: "select_claim", claim: "dragon", expectedVersion: 1 }, "p1")).toBeNull();
    expect(parseClientGameAction({ type: "respond_to_challenge", response: "maybe", expectedVersion: 1 }, "p1")).toBeNull();
  });

  it("keeps the supported action payloads narrow", () => {
    expect(
      parseClientGameAction({ type: "select_target", targetPlayerId: "p2", expectedVersion: 3 }, "p1"),
    ).toEqual({ type: "select_target", targetPlayerId: "p2", playerId: "p1", expectedVersion: 3 });
  });
});
