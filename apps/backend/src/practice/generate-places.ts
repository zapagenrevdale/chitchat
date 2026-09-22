// Generate sequentially to stay within Gemini image-generation rate limits.
/* oxlint-disable no-await-in-loop */
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { presetPlaces } from "@chitchat/contracts";

import { createGeminiProvider } from "./gemini";

const key = process.env.GEMINI_API_KEY_LIVE;
if (!key) {
  throw new Error("GEMINI_API_KEY_LIVE is required to generate preset images.");
}
const provider = createGeminiProvider(key, key);
const publicDirectory = new URL("../../../web/public/", import.meta.url);
await mkdir(new URL("images/places/", publicDirectory), { recursive: true });

for (const { name, description, imageSrc } of presetPlaces) {
  const destination = fileURLToPath(
    new URL(imageSrc.slice(1), publicDirectory)
  );
  if (await Bun.file(destination).exists()) {
    console.log(`Keeping existing image: ${name}`);
    continue;
  }
  const started = Date.now();
  const image = await provider.generatePlaceImage?.(
    { name, description },
    AbortSignal.timeout(60_000)
  );
  if (!image?.startsWith("data:image/jpeg;base64,")) {
    throw new Error(`Expected a JPEG image for ${name}.`);
  }
  await Bun.write(
    destination,
    Buffer.from(image.split(",")[1] ?? "", "base64")
  );
  console.log(
    `Generated ${name} in ${((Date.now() - started) / 1000).toFixed(1)}s`
  );
}
