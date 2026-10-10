import { describe, expect, it } from "vitest";
import { CARD_TYPES } from "./types";
import { createDeck, dealCards, shuffleDeck } from "./deck";

describe("createDeck", () => {
  it("creates eight unique cards for every animal type by default", () => {
    const deck = createDeck({ random: () => 0.5 });

    expect(deck).toHaveLength(CARD_TYPES.length * 8);
    expect(new Set(deck.map(({ id }) => id)).size).toBe(deck.length);
    for (const type of CARD_TYPES) {
      expect(deck.filter((card) => card.type === type)).toHaveLength(8);
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
  it("deals the whole deck round-robin, as evenly as possible", () => {
    const deck = [
      { id: "a", type: "bug" as const },
      { id: "b", type: "rat" as const },
      { id: "c", type: "bat" as const },
      { id: "d", type: "frog" as const },
      { id: "e", type: "fly" as const },
    ];
    const players = [{ id: "p1" }, { id: "p2" }];

    const result = dealCards(players, deck);

    expect(result.hands.p1.map(({ id }) => id)).toEqual(["a", "c", "e"]);
    expect(result.hands.p2.map(({ id }) => id)).toEqual(["b", "d"]);
    expect(result.remainingDeck).toEqual([]);
    expect([...result.hands.p1, ...result.hands.p2].map(({ id }) => id).sort()).toEqual(
      deck.map(({ id }) => id).sort(),
    );
  });

  it("rejects deals without one card per player and duplicate players", () => {
    const oneCard = [{ id: "a", type: "bug" as const }];
    const twoCards = [
      { id: "a", type: "bug" as const },
      { id: "b", type: "rat" as const },
    ];
    expect(() => dealCards([{ id: "p1" }, { id: "p2" }], oneCard)).toThrow(RangeError);
    expect(() => dealCards([{ id: "p1" }, { id: "p1" }], twoCards)).toThrow(RangeError);
  });
});
