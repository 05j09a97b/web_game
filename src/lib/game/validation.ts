import type { GameAction, GameError, GameState, PlayerId } from "./types";

export function validateActionVersion(state: GameState, action: GameAction): GameError | null {
  return action.expectedVersion === state.version
    ? null
    : {
        code: "stale_action",
        message: `Action expected version ${action.expectedVersion}, current version is ${state.version}.`,
      };
}

export function findPlayer(state: GameState, playerId: PlayerId) {
  return state.players.find((player) => player.id === playerId) ?? null;
}

export function validateCurrentPlayer(state: GameState, playerId: PlayerId): GameError | null {
  if (!findPlayer(state, playerId)) {
    return { code: "player_not_found", message: "Player is not part of this game." };
  }
  if (state.currentPlayerId !== playerId) {
    return { code: "not_your_turn", message: "It is not this player's turn." };
  }
  return null;
}

export function phaseError(expectedPhase: string): GameError {
  return {
    code: "invalid_phase",
    message: `This action is not allowed during the current phase; expected ${expectedPhase}.`,
  };
}
