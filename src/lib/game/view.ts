import type { GameState, PlayerGameView, PlayerId } from "./types";

export function createPlayerGameView(state: GameState, viewerId: PlayerId): PlayerGameView | null {
  const viewer = state.players.find(({ id }) => id === viewerId);
  if (!viewer) return null;

  const pending = state.pendingTurn;
  const cardIsRevealed =
    state.phase === "reveal" ||
    state.phase === "resolve" ||
    state.phase === "next_turn" ||
    state.phase === "game_over";

  return {
    gameId: state.id,
    phase: state.phase,
    version: state.version,
    turnNumber: state.turnNumber,
    currentPlayerId: state.currentPlayerId,
    nextPlayerId: state.nextPlayerId,
    players: state.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      cardCount: player.hand.length,
      penaltyCards: [...player.penaltyCards],
      connected: player.connected,
    })),
    ownHand: [...viewer.hand],
    pendingClaim:
      pending?.targetPlayerId && pending.claim
        ? {
            senderId: pending.senderId,
            receiverId: pending.targetPlayerId,
            claim: pending.claim,
            revealedCardType: cardIsRevealed ? pending.card.type : null,
            response: pending.response,
          }
        : null,
    lastResolution: state.lastResolution,
    gameOver: state.gameOver,
  };
}
