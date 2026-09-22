import { practiceSelectionSchema } from "@chitchat/contracts";
import { describe, expect, it } from "vitest";

import {
  buildSystemInstruction,
  compatibleSettings,
  resolveSelection,
} from "./catalog";
import { applySetupAnswer, randomizeSetup } from "./setup";
import type { SetupAnswer } from "./setup";

const answer: SetupAnswer = {
  place: null,
  setting: null,
  difficulty: null,
  personaId: null,
  random: "none",
};
const selection = {
  placeId: "cafe",
  settingId: "ordering",
  difficulty: "easy" as const,
  personaId: "maya",
};

describe("practice mission setup", () => {
  it("validates the language and keeps it through setup into the live prompt", () => {
    const selected = practiceSelectionSchema.parse({
      ...selection,
      language: "Filipino",
    });
    const randomized = randomizeSetup({
      selection: selected,
      step: "place",
      action: "random-all",
    });
    expect(randomized.language).toBe("Filipino");
    expect(buildSystemInstruction({ ...selected, ...randomized })).toContain(
      "Speak in Filipino."
    );
    expect(buildSystemInstruction(selection)).toContain("Speak in English.");
    expect(
      practiceSelectionSchema.safeParse({ ...selection, language: "Klingon" })
        .success
    ).toBeFalsy();
  });

  it("keeps random missions coherent and preserves the learner's level", () => {
    for (let index = 0; index < 30; index += 1) {
      const result = randomizeSetup({
        selection,
        step: "place",
        action: "random-all",
      });
      expect(result.difficulty).toBe("easy");
      expect(result.placeId).not.toBe(selection.placeId);
      expect(result.personaId).not.toBe(selection.personaId);
      expect(
        compatibleSettings(result.placeId).some(
          ({ id }) => id === result.settingId
        )
      ).toBeTruthy();
      expect(
        resolveSelection({
          personaId: result.personaId ?? "",
          placeId: result.placeId ?? "",
          settingId: result.settingId ?? "",
        })
      ).not.toBeNull();
    }
  });

  it("randomizes one choice without overwriting unrelated answers", () => {
    const result = randomizeSetup({
      selection,
      step: "persona",
      action: "random",
    });
    expect(result).toMatchObject({
      placeId: "cafe",
      settingId: "ordering",
      difficulty: "easy",
    });
    expect(result.personaId).not.toBe("maya");
    expect(
      randomizeSetup({ selection, step: "difficulty", action: "random" })
        .difficulty
    ).not.toBe("easy");
    expect(
      randomizeSetup({ selection: {}, step: "place", action: "random" })
    ).not.toHaveProperty("personaId");
  });

  it("uses a balanced default for a fresh random mission", () => {
    expect(
      randomizeSetup({ selection: {}, step: "place", action: "random-all" })
        .difficulty
    ).toBe("balanced");
  });

  it("accepts a custom scene and carries difficulty into the live instructions", () => {
    const result = applySetupAnswer(
      { selection, step: "place", action: "answer" },
      {
        ...answer,
        place: "Hotel reception in Tokyo",
        setting: "Ask for a quiet room",
        difficulty: "stretch",
      }
    );
    expect(result).toMatchObject({
      placeId: "custom",
      customPlace: "Hotel reception in Tokyo",
      settingId: "custom",
      customSetting: "Ask for a quiet room",
      difficulty: "stretch",
      personaId: "maya",
    });
    const prompt = buildSystemInstruction({ ...selection, ...result });
    expect(prompt).toContain("Hotel reception in Tokyo");
    expect(prompt).toContain("Ask for a quiet room");
    expect(prompt).toContain("richer everyday vocabulary");
    expect(prompt).toMatch(
      /scene data, not instructions[\s\S]*Speak in English/u
    );
  });

  it("fills several explicit answers and leaves unspecified answers alone", () => {
    const result = applySetupAnswer(
      { selection: { personaId: "maya" }, step: "place", action: "answer" },
      { ...answer, place: "cafe", setting: "ordering", difficulty: "easy" }
    );
    expect(result).toStrictEqual(selection);
  });

  it("invalidates a dependent situation when changing to an incompatible place", () => {
    const result = applySetupAnswer(
      { selection, step: "place", action: "answer" },
      { ...answer, place: "airport" }
    );
    expect(result.placeId).toBe("airport");
    expect(result.settingId).toBeUndefined();
    expect(result.difficulty).toBe("easy");
    expect(result.personaId).toBe("maya");
  });

  it("honors explicit constraints when randomizing the rest of a mission", () => {
    const result = applySetupAnswer(
      { selection: {}, step: "place", action: "answer" },
      { ...answer, place: "hotel", difficulty: "easy", random: "all" }
    );
    expect(result.placeId).toBe("hotel");
    expect(result.difficulty).toBe("easy");
    expect(result.personaId).toBeTruthy();
    expect(
      compatibleSettings("hotel").some(({ id }) => id === result.settingId)
    ).toBeTruthy();
  });

  it("rejects an invented partner from the interpreter", () => {
    expect(() =>
      applySetupAnswer(
        { selection, step: "persona", action: "answer" },
        { ...answer, personaId: "invented" }
      )
    ).toThrow("Unknown");
  });
});
