import { describe, expect, it } from "vitest";
import { CARD_TYPES } from "./types";
import { createDeck, dealCards, shuffleDeck } from "./deck";

describe("createDeck", () => {
  it("creates four unique cards for every configured type by default", () => {
    const deck = createDeck({ random: () => 0.5 });

    expect(deck).toHaveLength(CARD_TYPES.length * 4);
    expect(new Set(deck.map(({ id }) => id)).size).toBe(deck.length);
    for (const type of CARD_TYPES) {
      expect(deck.filter((card) => card.type === type)).toHaveLength(4);
    }
  });

  it("rejects an invalid copy count and random source", () => {
    expect(() => createDeck({ copiesPerType: 0 })).toThrow(RangeError);
    expect(() =>
      shuffleDeck(
        [
          { id: "one", type: "rat" },
          { id: "two", type: "bug" },
        ],
        () => Number.NaN,
      ),
    ).toThrow(RangeError);
  });
});

describe("dealCards", () => {
  it("deals cards round-robin and returns the undealt cards", () => {
    const deck = [
      { id: "a", type: "bug" as const },
      { id: "b", type: "rat" as const },
      { id: "c", type: "bat" as const },
      { id: "d", type: "frog" as const },
      { id: "e", type: "fly" as const },
    ];
    const players = [{ id: "p1" }, { id: "p2" }];

    const result = dealCards(players, deck, 2);

    expect(result.hands.p1.map(({ id }) => id)).toEqual(["a", "c"]);
    expect(result.hands.p2.map(({ id }) => id)).toEqual(["b", "d"]);
    expect(result.remainingDeck.map(({ id }) => id)).toEqual(["e"]);
  });

  it("rejects impossible deals and duplicate players", () => {
    const oneCard = [{ id: "a", type: "bug" as const }];
    expect(() => dealCards([{ id: "p1" }, { id: "p2" }], oneCard, 1)).toThrow(RangeError);
    expect(() => dealCards([{ id: "p1" }, { id: "p1" }], oneCard, 1)).toThrow(RangeError);
  });
});
