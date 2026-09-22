import { createAvatar } from "@dicebear/core";
import * as lorelei from "@dicebear/lorelei";

import { personaAvatars } from "./persona-avatars";

export function renderPersonaAvatar(id: string) {
  const selection = personaAvatars[id];
  if (!selection) {
    throw new Error(`Missing persona avatar for ${id}.`);
  }

  return createAvatar(lorelei, {
    seed: `chitchat-${id}`,
    size: 256,
    scale: 110,
    backgroundColor: ["ffffff"],
    eyebrowsColor: selection.features.hairColor,
    eyesColor: ["302923"],
    earringsColor: ["bd9049"],
    glassesColor: ["47566b"],
    frecklesColor: ["8e5b45"],
    beardProbability: 0,
    earringsProbability: 0,
    frecklesProbability: 0,
    glassesProbability: 0,
    hairAccessoriesProbability: 0,
    ...selection.features,
  }).toString();
}
