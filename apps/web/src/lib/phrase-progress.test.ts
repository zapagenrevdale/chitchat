import { describe, expect, it } from "vitest";

import { matchPhrase, phraseWordStates, speechWords } from "./phrase-progress";

describe("Guided phrase matching", () => {
  it("treats ordinary words as text, including object property names", () => {
    expect(speechWords("constructor prototype")).toStrictEqual([
      "constructor",
      "prototype",
    ]);
  });

  it("normalizes case, punctuation, and explicit contraction equivalents", () => {
    const target = speechWords("I’m happy, but I can't stay.");
    expect(matchPhrase(target, "I am happy but I cannot stay!")).toBe(
      target.length
    );
    expect(speechWords("he's ready")).not.toStrictEqual(
      speechWords("he has ready")
    );
  });

  it("does not skip missing words or accept substitutions", () => {
    const target = speechWords("I usually go for a walk");
    expect(matchPhrase(target, "I go for a walk")).toBe(1);
    expect(matchPhrase(target, "I usually run for a walk")).toBe(2);
    expect(matchPhrase(target, "The weather is nice")).toBe(0);
  });

  it("supports fillers, repetitions, and retrying the unresolved suffix", () => {
    const target = speechWords("I usually go for a walk");
    expect(matchPhrase(target, "um I I usually uh go for a walk")).toBe(
      target.length
    );
    expect(matchPhrase(target, "I usually go for a walk", 2)).toBe(
      target.length
    );
    expect(matchPhrase(target, "go for a walk", 2)).toBe(target.length);
  });

  it("keeps a contracted display word provisional until both tokens are confirmed", () => {
    expect(phraseWordStates("I'm happy", 1, 2)).toStrictEqual([
      { word: "I'm", state: "provisional" },
      { word: "happy", state: "upcoming" },
    ]);
  });
});
