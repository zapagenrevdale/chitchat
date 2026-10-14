import { describe, expect, it } from "vitest";

import { bypassDevelopmentLimits } from "./development-limits";

describe("development limit bypass", () => {
  it.each([
    { options: undefined, expected: false },
    { options: { environment: "development", bypass: true }, expected: true },
    { options: { environment: "development", bypass: false }, expected: false },
    { options: { environment: "production", bypass: true }, expected: false },
    { options: { environment: "test", bypass: true }, expected: false },
    { options: { environment: "unknown", bypass: true }, expected: false },
  ])("returns $expected for $options", ({ options, expected }) => {
    expect(bypassDevelopmentLimits(options)).toBe(expected);
  });
});
