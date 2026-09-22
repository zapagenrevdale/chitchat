const contractions = new Map(
  Object.entries({
    "i'm": "i am",
    "you're": "you are",
    "we're": "we are",
    "they're": "they are",
    "i've": "i have",
    "you've": "you have",
    "we've": "we have",
    "they've": "they have",
    "i'll": "i will",
    "you'll": "you will",
    "we'll": "we will",
    "they'll": "they will",
    "don't": "do not",
    "doesn't": "does not",
    "didn't": "did not",
    "can't": "cannot",
    "won't": "will not",
    "isn't": "is not",
    "aren't": "are not",
    "wasn't": "was not",
  })
);
const fillers = new Set(["um", "uh", "erm", "hmm"]);

export function speechWords(text: string): string[] {
  const words =
    text
      .normalize("NFKC")
      .toLowerCase()
      .replaceAll("’", "'")
      .match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];
  return words.flatMap((word) => (contractions.get(word) ?? word).split(" "));
}

// Match a contiguous phrase, with fillers and restarts of the matched prefix.
// An unrelated word stops progress; saying the missing suffix again can repair it.
export function matchPhrase(target: string[], spoken: string, confirmed = 0) {
  const words = speechWords(spoken);
  let next = confirmed;
  let repeated = 0;
  for (const word of words) {
    if (word === target[next]) {
      next += 1;
      repeated = 0;
    } else if (fillers.has(word)) {
      continue;
    } else if (word === target[repeated] && repeated < next) {
      repeated += 1;
    } else if (next > 0 && word === target[next - 1]) {
      continue;
    } else {
      break;
    }
  }
  return next;
}

export function phraseWordStates(
  text: string,
  confirmed: number,
  preview: number
) {
  let end = 0;
  return text.split(/\s+/u).map((word) => {
    end += speechWords(word).length;
    let state = "upcoming";
    if (end <= preview) {
      state = "provisional";
    }
    if (end <= confirmed) {
      state = "confirmed";
    }
    return { word, state };
  });
}
