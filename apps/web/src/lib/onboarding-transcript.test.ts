import { describe, expect, it } from "vitest";

import { OnboardingTranscript } from "./onboarding-transcript";

describe("turn-relative transcript cues", () => {
  it("preserves punctuation and whitespace instead of reconstructing words", () => {
    const transcript = new OnboardingTranscript();
    transcript.append({
      text: "Hello,  Alex!",
      words: [
        { word: "Hello", startOffset: "0s", endOffset: "0.2s" },
        { word: "Alex!", startOffset: "0.2s", endOffset: "0.5s" },
      ],
    });
    expect(transcript.prefix(0.199)).toBe("");
    expect(transcript.prefix(0.2)).toBe("Hello");
    expect(transcript.prefix(0.5)).toBe("Hello,  Alex!");
  });

  it.each([
    { text: "two", startOffset: "0.1s", endOffset: "bad" },
    { text: "two", startOffset: "-1s", endOffset: "0.4s" },
    { text: "two", startOffset: "0.5s", endOffset: "0.4s" },
    { text: "two", startOffset: "0s", endOffset: "0.1s" },
    { text: "two", endOffset: "0.4s" },
    { text: "missing", startOffset: "0.2s", endOffset: "0.4s" },
  ])("paces the suffix after an invalid or unmatched cue %j", (word) => {
    const transcript = new OnboardingTranscript();
    transcript.append({
      text: "one two three",
      words: [{ text: "one", startOffset: "0s", endOffset: "0.2s" }, word],
    });
    expect(transcript.prefix(0.2)).toBe("one");
    expect(transcript.prefix(0.61)).toBe("one two");
    expect(transcript.prefix(1.01)).toBe("one two three");
    expect(transcript.text).toBe("one two three");
  });

  it("paces an untimed lexical gap without crossing a future exact cue", () => {
    const transcript = new OnboardingTranscript();
    transcript.append({ text: "one two " });
    transcript.append({
      text: "three",
      words: [{ text: "three", startOffset: "1s", endOffset: "2s" }],
    });
    expect(transcript.prefix(0.5)).toBe("one");
    expect(transcript.prefix(1.5)).toBe("one two");
    expect(transcript.prefix(2)).toBe("one two three");
    expect(transcript.text).toBe("one two three");
  });

  it("accepts raw websocket offsets at the boundary without inventing word timings", () => {
    const transcript = new OnboardingTranscript();
    transcript.append({
      text: "Hello, Alex.",
      startOffset: "0s",
      endOffset: "0.5s",
    });
    expect(transcript.prefix(0.4)).toBe("");
    expect(transcript.prefix(0.5)).toBe("Hello, Alex.");
  });

  it("catches up timestamps that arrive without another text delta", () => {
    const transcript = new OnboardingTranscript();
    transcript.append({ text: "Hello." });
    expect(transcript.prefix(0.1)).toBe("");
    transcript.append({
      words: [{ text: "Hello.", startOffset: "0s", endOffset: "0.5s" }],
    });
    expect(transcript.prefix(10)).toBe("Hello.");
  });

  it("reveals a long untimed response progressively using consumed speech", () => {
    const transcript = new OnboardingTranscript();
    transcript.append({ text: "one two three four five six seven eight" });
    expect(transcript.prefix(0)).toBe("");
    expect(transcript.prefix(0.5)).toBe("one");
    expect(transcript.prefix(1)).toBe("one two");
    expect(transcript.prefix(1)).toBe("one two");
    expect(transcript.prefix(2)).toBe("one two three four five");
  });

  it("distributes words over known complete PCM duration", () => {
    const transcript = new OnboardingTranscript();
    transcript.append({ text: "one two three four" });
    expect(transcript.prefix(0.5, 4)).toBe("");
    expect(transcript.prefix(1, 4)).toBe("one");
    expect(transcript.prefix(2, 4)).toBe("one two");
    expect(transcript.prefix(4, 4)).toBe("one two three four");
  });

  it("adapts undisclosed words on generation completion without a jump or retraction", () => {
    const transcript = new OnboardingTranscript();
    transcript.append({ text: "one two three four five six" });
    expect(transcript.prefix(0.8)).toBe("one two");
    expect(transcript.prefix(0.8, 1.6)).toBe("one two");
    expect(transcript.prefix(1, 1.6)).toBe("one two three");
    expect(transcript.prefix(1.41, 1.6)).toBe("one two three four five");
    expect(transcript.prefix(1.6, 1.6)).toBe(transcript.text);
  });

  it("keeps nominal pacing while transcription keeps streaming", () => {
    const transcript = new OnboardingTranscript();
    transcript.append({ text: "one two three four" });
    expect(transcript.prefix(0.1)).toBe("");
    transcript.append({ text: " five" });
    expect(transcript.prefix(0.2)).toBe("");
    transcript.append({ text: " six" });
    expect(transcript.prefix(0.3)).toBe("");
    transcript.append({ text: " seven" });
    expect(transcript.prefix(0.4)).toBe("one");
    transcript.append({ text: " eight" });
    expect(transcript.prefix(0.8)).toBe("one two");
  });

  it("spreads a missing suffix after authoritative exact spans", () => {
    const transcript = new OnboardingTranscript();
    transcript.append({
      text: "one two three four",
      words: [{ word: "one", startOffset: "0s", endOffset: "1s" }],
    });
    expect(transcript.prefix(0.9, 4)).toBe("");
    expect(transcript.prefix(1, 4)).toBe("one");
    expect(transcript.prefix(2, 4)).toBe("one two");
    expect(transcript.prefix(3, 4)).toBe("one two three");
  });

  it("keeps a visible prefix when late text and exact cues arrive during underflow", () => {
    const transcript = new OnboardingTranscript();
    transcript.append({ text: "Hello, " });
    expect(transcript.prefix(0.5)).toBe("Hello,");
    transcript.append({
      text: "Alex. Welcome back!",
      words: [{ word: "Hello", startOffset: "0s", endOffset: "2s" }],
    });
    expect(transcript.prefix(0.5)).toBe("Hello,");
    expect(transcript.prefix(0.5)).toBe("Hello,");
    expect(transcript.prefix(2.5)).toBe("Hello, Alex.");
  });

  it("preserves nonspace languages, emoji, punctuation and canonical spacing", () => {
    const transcript = new OnboardingTranscript();
    const text = "你好，世界！  今天练习对话🙂。";
    transcript.append({ text });
    const early = transcript.prefix(0.5);
    expect(early).toBe("你好，");
    expect(text.startsWith(early)).toBeTruthy();
    expect(transcript.prefix(100)).toBe(text);
  });

  it("clamps malformed playback values and holds late text when audio is exhausted", () => {
    const transcript = new OnboardingTranscript();
    transcript.append({ text: "one two" });
    expect(transcript.prefix(Number.NaN, Number.NaN)).toBe("");
    expect(transcript.prefix(-1, -1)).toBe("");
    expect(transcript.prefix(1, 1)).toBe("one two");
    transcript.append({ text: " three four" });
    expect(transcript.prefix(1, 1)).toBe("one two");
    expect(transcript.prefix(Number.POSITIVE_INFINITY, 1)).toBe("one two");
  });
});
