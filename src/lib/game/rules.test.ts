import { describe, expect, it } from "vitest";
import { checkLoseCondition, determineNextPlayer, resolveChallenge } from "./rules";
import type { Card } from "./types";

const rat: Card = { id: "rat-1", type: "rat" };

describe("resolveChallenge", () => {
  it("assigns the penalty to the sender when TRUE is correct", () => {
    expect(
      resolveChallenge({
        claim: "rat",
        actualCard: rat,
        response: "true",
        senderId: "sender",
        receiverId: "receiver",
      }),
    ).toEqual({ responseWasCorrect: true, penaltyOwnerId: "sender" });
  });

  it("assigns the penalty to the sender when BLUFF is correct", () => {
    expect(
      resolveChallenge({
        claim: "bug",
        actualCard: rat,
        response: "bluff",
        senderId: "sender",
        receiverId: "receiver",
      }),
    ).toEqual({ responseWasCorrect: true, penaltyOwnerId: "sender" });
  });

  it("assigns the penalty to the receiver when their challenge is wrong", () => {
    expect(
      resolveChallenge({
        claim: "rat",
        actualCard: rat,
        response: "bluff",
        senderId: "sender",
        receiverId: "receiver",
      }),
    ).toEqual({ responseWasCorrect: false, penaltyOwnerId: "receiver" });

    expect(
      resolveChallenge({
        claim: "bug",
        actualCard: rat,
        response: "true",
        senderId: "sender",
        receiverId: "receiver",
      }),
    ).toEqual({ responseWasCorrect: false, penaltyOwnerId: "receiver" });
  });
});

describe("checkLoseCondition", () => {
  it("returns the card type that reaches four face-up cards", () => {
    expect(checkLoseCondition([rat, { ...rat, id: "rat-2" }, { ...rat, id: "rat-3" }])).toBeNull();
    expect(
      checkLoseCondition([
        rat,
        { ...rat, id: "rat-2" },
        { ...rat, id: "rat-3" },
        { ...rat, id: "rat-4" },
      ]),
    ).toBe("rat");
  });

  it("validates a custom threshold", () => {
    expect(() => checkLoseCondition([], 0)).toThrow(RangeError);
  });
});

describe("determineNextPlayer", () => {
  it("moves clockwise and skips players who have no cards", () => {
    const players = [
      { id: "p1", hand: [rat] },
      { id: "p2", hand: [] },
      { id: "p3", hand: [rat] },
    ];

    expect(determineNextPlayer(players, "p1")).toBe("p3");
    expect(determineNextPlayer(players, "p3")).toBe("p1");
    expect(determineNextPlayer(players, "unknown")).toBeNull();
    expect(determineNextPlayer([{ id: "p1", hand: [rat] }], "p1")).toBe("p1");
  });
});
