import { describe, expect, it } from "vitest";

import introductions from "../../../public/audio/chit/manifest.json";
import welcomes from "../../../public/audio/chit/welcome/manifest.json";

describe("saved introduction timestamps", () => {
  it.each([...introductions, ...welcomes])(
    "$language preserves its complete text and valid audio timing",
    (sample) => {
      expect(sample.words.length).toBeGreaterThan(0);
      expect(sample.words.map((word) => word.text).join("")).toBe(sample.text);
      expect(
        sample.words.every(
          (word, index) =>
            Number.isFinite(word.start) &&
            Number.isFinite(word.end) &&
            word.start >= (sample.words[index - 1]?.end ?? 0) &&
            word.end >= word.start &&
            word.end <= sample.seconds + 0.1
        )
      ).toBeTruthy();
    }
  );
});
