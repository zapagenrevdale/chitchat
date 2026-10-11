function normalize(text: string) {
  return (
    text
      .replaceAll(/[ァ-ヶ]/gu, (character) =>
        String.fromCodePoint((character.codePointAt(0) ?? 0) - 0x60)
      )
      // ASR often spells a word-final Arabic taa marbuta as haa.
      .replaceAll("ة", "ه")
      .normalize("NFKD")
      .toLowerCase()
      .replaceAll(/[^\p{L}\p{N}]/gu, "")
  );
}

export interface SpokenWord {
  word: string;
  start: number;
  end: number;
}

/** Preserve the authored spelling and punctuation while attaching ASR timings. */
export function alignIntroduction(
  text: string,
  words: SpokenWord[],
  seconds: number
) {
  const characters: { value: string; offset: number }[] = [];
  let offset = 0;
  for (const character of text) {
    for (const value of normalize(character)) {
      characters.push({ value, offset });
    }
    offset += character.length;
  }
  let consumed = 0;
  let previousEnd = 0;
  const starts: number[] = [];
  for (const word of words) {
    const normalized = normalize(word.word);
    const expected = characters
      .slice(consumed, consumed + normalized.length)
      .map((entry) => entry.value)
      .join("");
    if (!normalized || expected !== normalized) {
      throw new Error(
        `Transcript differs from authored introduction at ${word.word}`
      );
    }
    if (
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.start < previousEnd ||
      word.end < word.start ||
      word.end > seconds + 0.1
    ) {
      throw new Error(`Invalid word timing for ${word.word}`);
    }
    starts.push(consumed === 0 ? 0 : characters[consumed].offset);
    consumed += normalized.length;
    previousEnd = word.end;
  }
  if (!words.length || consumed !== characters.length) {
    throw new Error("Transcript does not cover the complete introduction");
  }
  return words.map((word, index) => ({
    text: text.slice(starts[index], starts[index + 1] ?? text.length),
    start: word.start,
    end: word.end,
  }));
}
