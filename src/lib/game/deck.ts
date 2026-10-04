import { CARD_TYPES, type Card, type PlayerId, type PlayerSetup } from "./types";

export const DEFAULT_COPIES_PER_TYPE = 4;
export const DEFAULT_CARDS_PER_PLAYER = 4;

export interface CreateDeckOptions {
  copiesPerType?: number;
  random?: () => number;
}

export interface DealResult {
  hands: Record<PlayerId, Card[]>;
  remainingDeck: Card[];
}

export function createDeck({
  copiesPerType = DEFAULT_COPIES_PER_TYPE,
  random = Math.random,
}: CreateDeckOptions = {}): Card[] {
  if (!Number.isInteger(copiesPerType) || copiesPerType < 1) {
    throw new RangeError("copiesPerType must be a positive integer.");
  }

  const cards = CARD_TYPES.flatMap((type) =>
    Array.from({ length: copiesPerType }, (_, copyIndex) => ({
      id: `${type}-${copyIndex + 1}`,
      type,
    })),
  );

  return shuffleDeck(cards, random);
}

export function shuffleDeck(cards: readonly Card[], random: () => number = Math.random): Card[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError("The random source must return a value in [0, 1).");
    }

    const swapIndex = Math.floor(sample * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function dealCards(
  players: readonly Pick<PlayerSetup, "id">[],
  deck: readonly Card[],
  cardsPerPlayer: number,
): DealResult {
  if (players.length === 0) {
    throw new RangeError("At least one player is required to deal cards.");
  }
  if (!Number.isInteger(cardsPerPlayer) || cardsPerPlayer < 1) {
    throw new RangeError("cardsPerPlayer must be a positive integer.");
  }
  if (new Set(players.map((player) => player.id)).size !== players.length) {
    throw new RangeError("Player IDs must be unique.");
  }

  const requiredCards = players.length * cardsPerPlayer;
  if (requiredCards > deck.length) {
    throw new RangeError("The deck does not contain enough cards for every player.");
  }

  const hands = Object.fromEntries(players.map(({ id }) => [id, [] as Card[]])) as Record<
    PlayerId,
    Card[]
  >;

  for (let cardIndex = 0; cardIndex < requiredCards; cardIndex += 1) {
    const player = players[cardIndex % players.length];
    hands[player.id].push(deck[cardIndex]);
  }

  return {
    hands,
    remainingDeck: deck.slice(requiredCards),
  };
}
