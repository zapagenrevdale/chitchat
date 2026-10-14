import { createHash } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { GoogleGenAI, Modality, ThinkingLevel } from "@google/genai";

import { encodePcmMp3 } from "./encode-pcm-mp3";
import { personas } from "./personas";

// Run manually from the workspace root: bun run generate:introductions
// Bun loads the backend .env. Existing matching clips are never regenerated.
const apiKey =
  process.env.GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY_LIVE?.trim();
if (!apiKey) {
  throw new Error("Configure GEMINI_API_KEY in apps/backend/.env first.");
}
if (!Bun.which("ffmpeg")) {
  throw new Error("Install ffmpeg before generating introduction MP3s.");
}
const ai = new GoogleGenAI({ apiKey });
const model = "gemini-3.1-flash-live-preview";
const directory = fileURLToPath(
  new URL("../../../web/public/audio/personas/", import.meta.url)
);
await mkdir(directory, { recursive: true });
const manifestFile = Bun.file(`${directory}/manifest.json`);
interface Recording {
  fingerprint: string;
  voice: string;
  introduction: string;
  transcript: string;
  seconds: number;
  generatedAt: string;
  model: string;
}
const manifest: Record<string, Recording> = (await manifestFile.exists())
  ? await manifestFile.json()
  : {};

async function record(persona: (typeof personas)[number]) {
  const instruction = `Speak this short introduction as ${persona.name}. Voice traits: ${persona.tags.join(", ")}. Character: ${persona.character}\nRead only the exact introduction below, naturally and conversationally in English. No added words, music, sound effects, or commentary. Keep it brief without rushing.\nIntroduction: ${persona.introduction}`;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ model, voice: persona.voice, instruction }))
    .digest("hex");
  const destination = `${directory}/${persona.id}.mp3`;
  if (
    manifest[persona.id]?.fingerprint === fingerprint &&
    (await Bun.file(destination).exists())
  ) {
    console.log(`Saved clip reused: ${persona.name}`);
    return;
  }
  const complete = Promise.withResolvers<undefined>();
  const chunks: Buffer[] = [];
  let transcript = "";
  let sampleRate = 24_000;
  const timer = setTimeout(
    () => complete.reject(new Error("Audio generation timed out.")),
    45_000
  );
  // Attach a handler before connecting so a connection delay cannot cause an unhandled rejection.
  // oxlint-disable-next-line prefer-await-to-then
  void complete.promise.catch(() => {
    // The original promise is awaited below; this only marks early rejection handled.
  });
  let session: Awaited<ReturnType<typeof ai.live.connect>> | undefined;
  try {
    session = await ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        systemInstruction: instruction,
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: persona.voice } },
        },
        outputAudioTranscription: {},
      },
      callbacks: {
        onmessage(message) {
          const content = message.serverContent;
          for (const part of content?.modelTurn?.parts ?? []) {
            if (
              part.inlineData?.data &&
              part.inlineData.mimeType?.startsWith("audio/pcm")
            ) {
              sampleRate = Number(
                /rate=(?<rate>\d+)/u.exec(part.inlineData.mimeType)?.groups
                  ?.rate ?? 24_000
              );
              chunks.push(Buffer.from(part.inlineData.data, "base64"));
            }
          }
          transcript += content?.outputTranscription?.text ?? "";
          if (content?.turnComplete) {
            complete.resolve();
          }
        },
        onerror() {
          complete.reject(new Error("Gemini audio generation failed."));
        },
        onclose() {
          complete.reject(new Error("Gemini closed before finishing audio."));
        },
      },
    });
    session.sendClientContent({
      turns: [
        {
          role: "user",
          parts: [
            { text: "Please say the introduction now, exactly as written." },
          ],
        },
      ],
      turnComplete: true,
    });
    await complete.promise;
  } finally {
    clearTimeout(timer);
    session?.close();
  }
  const pcm = Buffer.concat(chunks);
  const seconds = pcm.length / (sampleRate * 2);
  if (seconds < 1 || seconds > 12) {
    throw new Error(
      `Unexpected introduction duration for ${persona.name}: ${seconds.toFixed(1)}s`
    );
  }
  const temporary = `${destination}.tmp.mp3`;
  await encodePcmMp3(
    pcm,
    sampleRate,
    temporary,
    `MP3 encoding failed for ${persona.name}.`
  );
  await rename(temporary, destination);
  manifest[persona.id] = {
    fingerprint,
    voice: persona.voice,
    introduction: persona.introduction,
    transcript,
    seconds,
    generatedAt: new Date().toISOString(),
    model,
  };
  await Bun.write(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Saved ${persona.name} (${persona.voice}): ${seconds.toFixed(1)}s — ${transcript}`
  );
}

for (const persona of personas) {
  // Sequential requests keep provider load low and save progress after every clip.
  // oxlint-disable-next-line no-await-in-loop
  await record(persona);
}
