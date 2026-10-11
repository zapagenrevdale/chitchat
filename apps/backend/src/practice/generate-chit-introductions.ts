import { createHash } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { practiceLanguageLocales } from "@chitchat/contracts/languages";
import type { WordInfo } from "@google/genai";
import { GoogleGenAI, Modality } from "@google/genai";

import { alignIntroduction } from "./introduction-timing";

// --welcome generates the follow-up welcome; --force regenerates aligned clips.
const welcome = process.argv.includes("--welcome");
const apiKey =
  process.env.GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY_LIVE?.trim();
if (!apiKey || !Bun.which("ffmpeg")) {
  throw new Error(
    "Configure GEMINI_API_KEY and install ffmpeg before generating introductions."
  );
}
const ai = new GoogleGenAI({ apiKey });
const directory = fileURLToPath(
  new URL(
    welcome
      ? "../../../web/public/audio/chit/welcome/"
      : "../../../web/public/audio/chit/",
    import.meta.url
  )
);
const staging = fileURLToPath(
  new URL("../../../../.worktree/chit-introductions/", import.meta.url)
);
await mkdir(staging, { recursive: true });
const force = process.argv.includes("--force");
const manifestFile = Bun.file(`${directory}/manifest.json`);
interface Introduction {
  code: string;
  language: string;
  voice: string;
  model: string;
  text: string;
  seconds: number;
  file: string;
  generatedAt: string;
  timingModel?: string;
  words?: { text: string; start: number; end: number }[];
}
const manifest: Introduction[] = await manifestFile.json();
const model = "gemini-3.1-flash-tts-preview";
const timingModel = "gemini-3.5-transcribe";

async function synthesize(sample: Introduction, temporary: string) {
  const response = await ai.models.generateContent({
    model,
    contents: `Read this greeting exactly as written in ${sample.language}. Speak warmly and naturally at a relaxed conversational pace, with short pauses between sentences. No extra words: ${sample.text}`,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: sample.voice } },
      },
    },
  });
  const audio = response.candidates?.[0]?.content?.parts?.find((part) =>
    part.inlineData?.mimeType?.startsWith("audio/")
  )?.inlineData;
  if (!audio?.data) {
    throw new Error(`No TTS audio for ${sample.language}`);
  }
  const rate = Number(
    /rate=(?<rate>\d+)/u.exec(audio.mimeType ?? "")?.groups?.rate ?? 24_000
  );
  const pcm = Buffer.from(audio.data, "base64");
  const seconds = pcm.length / (rate * 2);
  if (seconds < 1 || seconds > (welcome ? 40 : 20)) {
    throw new Error(`Unexpected greeting duration: ${seconds}s`);
  }
  const encoder = Bun.spawn(
    [
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "s16le",
      "-ar",
      String(rate),
      "-ac",
      "1",
      "-i",
      "pipe:0",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "64k",
      temporary,
    ],
    { stdin: pcm, stdout: "ignore", stderr: "pipe" }
  );
  if ((await encoder.exited) !== 0) {
    throw new Error(`MP3 encoding failed for ${sample.language}`);
  }
  return seconds;
}

async function generate(sample: Introduction) {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        text: sample.text,
        voice: sample.voice,
        model,
        timingModel,
      })
    )
    .digest("hex")
    .slice(0, 12);
  const temporary = `${staging}/${sample.code}-${fingerprint}.mp3`;
  const reviewFile = Bun.file(`${staging}/${sample.code}-${fingerprint}.json`);
  let seconds: number;
  if (!force && (await Bun.file(temporary).exists())) {
    const probe = Bun.spawn(
      [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        temporary,
      ],
      { stdout: "pipe" }
    );
    seconds = Number(await new Response(probe.stdout).text());
  } else {
    seconds = await synthesize(sample, temporary);
  }
  let recognized: WordInfo[];
  if (!force && (await reviewFile.exists())) {
    recognized = await reviewFile.json();
  } else {
    const transcription = await ai.models.generateContent({
      model: timingModel,
      contents: [
        {
          inlineData: {
            mimeType: "audio/mp3",
            data: Buffer.from(await Bun.file(temporary).arrayBuffer()).toString(
              "base64"
            ),
          },
        },
      ],
      config: {
        audioTranscriptionConfig: {
          wordTimestamp: true,
          languageCodes: [sample.code],
        },
      },
    });
    recognized =
      transcription.candidates?.[0]?.content?.parts?.flatMap(
        (part) => part.audioTranscription?.words ?? []
      ) ?? [];
    await Bun.write(reviewFile, `${JSON.stringify(recognized, null, 2)}\n`);
    // Stay below the transcription model's ten requests per minute limit.
    await Bun.sleep(6500);
  }
  console.log(
    `Checking ${sample.language}; transcript review: ${reviewFile.name}`
  );
  const words = alignIntroduction(
    sample.text,
    recognized.map((word, index) => {
      const start = Number(word.startOffset?.replace(/s$/u, "") ?? Number.NaN);
      const end = Number(word.endOffset?.replace(/s$/u, "") ?? Number.NaN);
      return {
        word: word.word ?? "",
        start,
        // The welcome transcript has a truncated final end offset. Its start
        // is valid; use the clip boundary for that final word's end only.
        end:
          welcome && index === recognized.length - 1 && end < start
            ? seconds
            : end,
      };
    }),
    seconds
  );
  await rename(temporary, `${directory}/${sample.code}.mp3`);
  Object.assign(sample, {
    model,
    timingModel,
    seconds,
    words,
    generatedAt: new Date().toISOString(),
  });
  const existing = manifest.findIndex((item) => item.code === sample.code);
  if (existing === -1) {
    manifest.push(sample);
  } else {
    manifest[existing] = sample;
  }
  await Bun.write(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `${sample.language}: ${seconds.toFixed(2)}s, ${words.length} timed words`
  );
}

// Only publish clips after alignment succeeds; incomplete languages use text.
const samples: Introduction[] = welcome
  ? await Promise.all(
      Object.entries(practiceLanguageLocales).map(async ([language, code]) => {
        const messages = await Bun.file(
          new URL(`../../../web/messages/${code}.json`, import.meta.url)
        ).json();
        const text = `${messages.welcome_greeting} ${messages.welcome_body}`;
        const existing = manifest.find(
          (item) => item.code === code && item.text === text
        );
        return (
          existing ?? {
            code,
            language,
            text,
            voice: "Aoede",
            model,
            seconds: 0,
            file: `/audio/chit/welcome/${code}.mp3`,
            generatedAt: "",
          }
        );
      })
    )
  : manifest;
const selected = process.argv
  .find((value) => value.startsWith("--language="))
  ?.split("=")[1];
for (const sample of samples) {
  if (selected && sample.code !== selected) {
    continue;
  }
  if (sample.words?.length && !force) {
    continue;
  }
  // Save each verified clip so interrupted runs can resume without regenerating it.
  try {
    // oxlint-disable-next-line no-await-in-loop
    await generate(sample);
  } catch (error) {
    console.error(
      `${sample.language}: ${error instanceof Error ? error.message : "generation failed"}`
    );
    process.exitCode = 1;
  }
}
