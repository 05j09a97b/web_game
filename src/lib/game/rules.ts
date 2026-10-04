import type {
  Card,
  CardType,
  ChallengeResponse,
  PlayerId,
  PlayerState,
} from "./types";
import { CARD_TYPES } from "./types";

export const DEFAULT_LOSE_THRESHOLD = 4;

export interface ResolveChallengeInput {
  claim: CardType;
  actualCard: Card;
  response: ChallengeResponse;
  senderId: PlayerId;
  receiverId: PlayerId;
}

export interface ResolvedChallenge {
  responseWasCorrect: boolean;
  penaltyOwnerId: PlayerId;
}

export function resolveChallenge({
  claim,
  actualCard,
  response,
  senderId,
  receiverId,
}: ResolveChallengeInput): ResolvedChallenge {
  const claimWasTrue = claim === actualCard.type;
  const responseWasCorrect = response === "true" ? claimWasTrue : !claimWasTrue;

  return {
    responseWasCorrect,
    penaltyOwnerId: responseWasCorrect ? senderId : receiverId,
  };
}

export function checkLoseCondition(
  penaltyCards: readonly Card[],
  threshold = DEFAULT_LOSE_THRESHOLD,
): CardType | null {
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new RangeError("threshold must be a positive integer.");
  }

  const counts = new Map<CardType, number>();
  for (const card of penaltyCards) {
    const count = (counts.get(card.type) ?? 0) + 1;
    counts.set(card.type, count);
    if (count >= threshold) {
      return card.type;
    }
  }

  return null;
}

export function determineNextPlayer(
  players: readonly Pick<PlayerState, "id" | "hand">[],
  afterPlayerId: PlayerId,
): PlayerId | null {
  const currentIndex = players.findIndex((player) => player.id === afterPlayerId);
  if (currentIndex < 0 || players.length === 0) {
    return null;
  }

  for (let offset = 1; offset <= players.length; offset += 1) {
    const candidate = players[(currentIndex + offset) % players.length];
    if (candidate.hand.length > 0) {
      return candidate.id;
    }
  }

  return null;
}

export function isCardType(value: string): value is CardType {
  return CARD_TYPES.some((cardType) => cardType === value);
}
