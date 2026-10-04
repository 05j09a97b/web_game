import { isCardType } from "../game/rules";
import type { GameAction, PlayerId } from "../game/types";

export function parseClientGameAction(value: unknown, playerId: PlayerId): GameAction | null {
  if (!isRecord(value) || !Number.isInteger(value.expectedVersion) || (value.expectedVersion as number) < 0) {
    return null;
  }

  const expectedVersion = value.expectedVersion as number;
  switch (value.type) {
    case "select_card":
      return typeof value.cardId === "string" && value.cardId.length > 0
        ? { type: "select_card", playerId, cardId: value.cardId, expectedVersion }
        : null;
    case "select_target":
      return typeof value.targetPlayerId === "string" && value.targetPlayerId.length > 0
        ? { type: "select_target", playerId, targetPlayerId: value.targetPlayerId, expectedVersion }
        : null;
    case "select_claim":
      return typeof value.claim === "string" && isCardType(value.claim)
        ? { type: "select_claim", playerId, claim: value.claim, expectedVersion }
        : null;
    case "respond_to_challenge":
      return value.response === "true" || value.response === "bluff"
        ? { type: "respond_to_challenge", playerId, response: value.response, expectedVersion }
        : null;
    case "resolve_challenge":
    case "finish_resolution":
    case "advance_turn":
      return { type: value.type, playerId, expectedVersion };
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
