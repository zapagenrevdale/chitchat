import { practiceLanguages } from "@chitchat/contracts";
import { practiceLanguageLocales } from "@chitchat/contracts/languages";
import { describe, expect, it } from "vitest";

import { m } from "@/paraglide/messages";
import { getTextDirection, locales } from "@/paraglide/runtime";

import en from "../../messages/en.json";
import introductions from "../../public/audio/chit/manifest.json";
import welcomes from "../../public/audio/chit/welcome/manifest.json";

const catalogs = import.meta.glob<Record<string, string>>(
  "../../messages/*.json",
  {
    eager: true,
    import: "default",
  }
);
function sorted(values: readonly string[]) {
  // ES2022 has no toSorted; sort only this newly allocated copy.
  // oxlint-disable-next-line unicorn/no-array-sort
  return [...values].sort();
}

function placeholders(text: string) {
  return sorted([...text.matchAll(/\{\w+\}/gu)].map(([value]) => value));
}

describe("onboarding translation catalogs", () => {
  it("covers every selectable language and existing introduction locale", () => {
    expect(sorted(Object.keys(practiceLanguageLocales))).toStrictEqual(
      sorted([...practiceLanguages])
    );
    expect(sorted([...locales])).toStrictEqual(
      sorted(Object.values(practiceLanguageLocales))
    );
    expect(
      introductions.every(
        ({ language, code }) =>
          practiceLanguageLocales[
            language as keyof typeof practiceLanguageLocales
          ] === code
      )
    ).toBeTruthy();
  });

  it.each(locales)("%s has complete copy and intact parameters", (locale) => {
    const catalog = catalogs[`../../messages/${locale}.json`];
    expect(sorted(Object.keys(catalog))).toStrictEqual(sorted(Object.keys(en)));
    const invalid = Object.entries(en).filter(
      ([key, value]) =>
        !catalog[key]?.trim() ||
        JSON.stringify(placeholders(catalog[key])) !==
          JSON.stringify(placeholders(value))
    );
    expect(invalid).toStrictEqual([]);
  });

  it("isolates explicit locales without changing the next message's language", () => {
    expect(m.name_label({}, { locale: "ja" })).toBe("名前");
    expect(m.name_label({}, { locale: "ar" })).toBe("اسمك");
    expect(m.name_label({}, { locale: "en" })).toBe("Your name");
  });

  it.each(["ar", "he", "fa"] as const)(
    "uses right-to-left direction for %s",
    (locale) => {
      expect(getTextDirection(locale)).toBe("rtl");
    }
  );

  it.each(welcomes)(
    "$language welcome audio matches its catalog and preserves timing",
    (sample) => {
      const catalog = catalogs[`../../messages/${sample.code}.json`];
      expect(sample.text).toBe(
        `${catalog.welcome_greeting} ${catalog.welcome_body}`
      );
      expect(sample.words.map(({ text }) => text).join("")).toBe(sample.text);
      expect(
        sample.words.every(
          (word, index) =>
            word.start >= (sample.words[index - 1]?.end ?? 0) &&
            word.end >= word.start &&
            word.end <= sample.seconds + 0.1
        )
      ).toBeTruthy();
    }
  );
});
