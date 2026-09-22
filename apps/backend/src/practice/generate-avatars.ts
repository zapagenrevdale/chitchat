import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { personaAvatars } from "./persona-avatars";
import { personas } from "./personas";
import { renderPersonaAvatar } from "./render-persona-avatar";

const directory = fileURLToPath(
  new URL("../../../web/public/images/personas/", import.meta.url)
);
const hairstyles = new Set<string>();
const portraits = new Set<string>();

if (Object.keys(personaAvatars).length !== personas.length) {
  throw new Error("Every persona must have exactly one curated avatar.");
}

// Render and validate the whole cast before replacing any existing portraits.
const rendered = personas.map(({ id }) => {
  const selection = personaAvatars[id];
  const hair = selection?.features.hair;
  if (!selection || hair?.length !== 1 || hairstyles.has(hair[0])) {
    throw new Error(`Missing or repeated hairstyle for ${id}.`);
  }
  hairstyles.add(hair[0]);

  const svg = renderPersonaAvatar(id);

  if (portraits.has(svg)) {
    throw new Error(`Duplicate portrait for ${id}.`);
  }
  portraits.add(svg);
  return { id, svg };
});

await mkdir(directory, { recursive: true });
await Promise.all(
  rendered.map(({ id, svg }) => Bun.write(`${directory}/${id}.svg`, svg))
);
console.log(`Generated ${rendered.length} distinct Lorelei persona avatars.`);
