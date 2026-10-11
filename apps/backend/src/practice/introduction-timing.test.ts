import { describe, expect, it } from "vitest";

import { alignIntroduction } from "./introduction-timing";

describe("introduction timing", () => {
  it("keeps authored spelling and punctuation with the measured word boundaries", () => {
    expect(
      alignIntroduction(
        "Hi, I'm Chit!",
        [
          { word: "Hi", start: 0.2, end: 0.5 },
          { word: "I'm", start: 0.7, end: 0.9 },
          { word: "Chit.", start: 0.9, end: 1.2 },
        ],
        1.5
      )
    ).toStrictEqual([
      { text: "Hi, ", start: 0.2, end: 0.5 },
      { text: "I'm ", start: 0.7, end: 0.9 },
      { text: "Chit!", start: 0.9, end: 1.2 },
    ]);
  });

  it("handles Japanese script variations without changing timestamps", () => {
    expect(
      alignIntroduction(
        "チットです。",
        [
          { word: "ちっと", start: 0.2, end: 0.6 },
          { word: "です", start: 0.6, end: 0.8 },
        ],
        1
      )
    ).toStrictEqual([
      { text: "チット", start: 0.2, end: 0.6 },
      { text: "です。", start: 0.6, end: 0.8 },
    ]);
  });

  it("rejects missing, mismatched and out-of-range transcription", () => {
    expect(() => alignIntroduction("Hi", [], 1)).toThrow(
      "complete introduction"
    );
    expect(() =>
      alignIntroduction("Hi", [{ word: "Bye", start: 0, end: 0.2 }], 1)
    ).toThrow("differs");
    expect(() =>
      alignIntroduction("Hi", [{ word: "Hi", start: 0, end: 2 }], 1)
    ).toThrow("Invalid word timing");
  });
});

describe("Arabic transcription spelling", () => {
  it("preserves authored taa marbuta when ASR uses a final haa", () => {
    expect(
      alignIntroduction(
        "محادثات يومية.",
        [
          { word: "محادثات", start: 0, end: 0.5 },
          { word: "يوميه", start: 0.5, end: 1 },
        ],
        1
      )
    ).toStrictEqual([
      { text: "محادثات ", start: 0, end: 0.5 },
      { text: "يومية.", start: 0.5, end: 1 },
    ]);
    expect(() =>
      alignIntroduction("الثقة", [{ word: "اللغة", start: 0, end: 1 }], 1)
    ).toThrow("differs");
  });
});
