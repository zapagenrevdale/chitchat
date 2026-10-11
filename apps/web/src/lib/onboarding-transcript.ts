import type { Transcription, WordInfo } from "@google/genai";

type TimedWord = WordInfo & { text?: string };

type TimedTranscription = Omit<Transcription, "words"> & {
  words?: TimedWord[];
  startOffset?: string;
  endOffset?: string;
};

interface Cue {
  start: number;
  end: number;
  index: number;
  length: number;
}

interface Reveal {
  at: number;
  length: number;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
// While audio is still arriving, use a conservative 150 words per minute.
const nominalWordSeconds = 0.4;

function wordEnds(text: string, start: number, end: number) {
  const slice = text.slice(start, end);
  const words = [...segmenter.segment(slice)].filter((word) => word.isWordLike);
  return words.map((word, index) => {
    const next = words[index + 1]?.index ?? slice.length;
    return start + slice.slice(0, next).trimEnd().length;
  });
}

function seconds(offset: unknown) {
  if (typeof offset !== "string" || !/^\d+(?:\.\d{1,9})?s$/u.test(offset)) {
    return;
  }
  const value = Number(offset.slice(0, -1));
  return Number.isFinite(value) ? value : undefined;
}

// Interpret provider offsets on the output turn's audio timeline.
export class OnboardingTranscript {
  text = "";
  private cues: Cue[] = [];
  private matched = 0;
  private lastEnd = 0;
  private visible = 0;
  private elapsed = 0;
  private revealedAt = 0;
  private duration?: number;
  private dirty = true;
  private reveals: Reveal[] = [];

  append(transcription: TimedTranscription) {
    this.text += transcription.text ?? "";
    this.dirty = true;
    const words: TimedWord[] =
      transcription.words ??
      (transcription.startOffset !== undefined ||
      transcription.endOffset !== undefined
        ? [transcription]
        : []);
    for (const word of words) {
      const start = seconds(word.startOffset);
      const end = seconds(word.endOffset);
      const text = (word.word ?? word.text)?.trim();
      const index = text ? this.text.indexOf(text, this.matched) : -1;
      if (
        start === undefined ||
        end === undefined ||
        start > end ||
        end < this.lastEnd ||
        !text ||
        index < 0
      ) {
        continue;
      }
      this.matched = index + text.length;
      this.lastEnd = end;
      this.cues.push({ start, end, index, length: this.matched });
    }
  }

  private plan(duration?: number) {
    const preserveStreamingPace =
      duration === undefined &&
      this.duration === undefined &&
      this.reveals.some((reveal) => reveal.length > this.visible);
    this.reveals = [];
    let length = this.visible;
    let time = preserveStreamingPace ? this.revealedAt : this.elapsed;
    this.revealedAt = time;
    const approximate = (end: number, until?: number) => {
      const ends = wordEnds(this.text, length, end);
      let interval = nominalWordSeconds;
      if (until !== undefined) {
        interval =
          until > time
            ? (until - time) / ends.length
            : Number.POSITIVE_INFINITY;
      }
      for (const [index, boundary] of ends.entries()) {
        this.reveals.push({
          at: time + (index + 1) * interval,
          length: boundary,
        });
      }
    };
    for (const cue of this.cues) {
      if (cue.length <= length) {
        time = Math.max(time, cue.end);
        continue;
      }
      if (cue.start > time) {
        approximate(cue.index, cue.start);
      }
      this.reveals.push({ at: cue.end, length: cue.length });
      ({ length } = cue);
      time = Math.max(time, cue.end);
    }
    approximate(this.text.length, duration);
  }

  prefix(elapsedSeconds: number, audioDurationSeconds?: number) {
    const elapsed = Number.isFinite(elapsedSeconds)
      ? Math.max(this.elapsed, elapsedSeconds, 0)
      : this.elapsed;
    const duration =
      audioDurationSeconds !== undefined &&
      Number.isFinite(audioDurationSeconds) &&
      audioDurationSeconds > 0
        ? audioDurationSeconds
        : undefined;
    if (this.dirty || duration !== this.duration) {
      // Re-anchor only undisclosed text so late text and final duration cannot
      // retract words or spend already-consumed audio on a new sentence.
      this.plan(duration);
      this.duration = duration;
      this.dirty = false;
    }
    for (const reveal of this.reveals) {
      if (reveal.at > elapsed) {
        break;
      }
      if (reveal.length > this.visible) {
        this.visible = reveal.length;
        this.revealedAt = reveal.at;
      }
    }
    this.elapsed = elapsed;
    return this.text.slice(0, this.visible);
  }
}
