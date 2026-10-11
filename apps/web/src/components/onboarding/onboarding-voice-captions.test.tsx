import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import { OnboardingMicrophone } from "./onboarding-conversation";
import { useOnboardingLive } from "./use-onboarding-live";

vi.mock(import("./use-onboarding-live"), () => ({
  useOnboardingLive: vi.fn<typeof useOnboardingLive>(),
}));

const pause = vi.fn<() => void>();
const resume = vi.fn<() => void>();

function liveState(
  phase: "speaking" | "listening",
  reply: string,
  draft = ""
): ReturnType<typeof useOnboardingLive> {
  return {
    phase,
    messages: [
      { id: 1, role: "assistant", text: reply, final: phase === "listening" },
      ...(draft
        ? [{ id: 2, role: "user" as const, text: draft, final: false }]
        : []),
    ],
    error: null,
    result: null,
    start: vi.fn<() => void>(),
    stop: vi.fn<() => void>(),
    pause,
    resume,
    getInputVolume: () => 0,
    getAnalyser: () => null,
  };
}

function microphone() {
  return (
    <OnboardingMicrophone
      name="Alex"
      language="English"
      onMessages={vi.fn<() => void>()}
      onResolved={vi.fn<() => void>()}
      onReady={vi.fn<() => void>()}
      onRestart={vi.fn<() => void>()}
      onSwitch={vi.fn<() => void>()}
    />
  );
}

describe("voice onboarding caption announcements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOnboardingLive).mockReturnValue(
      liveState("speaking", "Where do")
    );
  });
  afterEach(cleanup);

  it("keeps incremental and final captions readable without live announcements", () => {
    const view = render(microphone());
    const caption = screen.getByText("Where do");
    expect(caption).toBeVisible();
    expect(caption).toHaveAttribute("aria-live", "off");
    expect(caption.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByText(en.voice_speaking)).toHaveAttribute(
      "aria-live",
      "polite"
    );

    vi.mocked(useOnboardingLive).mockReturnValue(
      liveState("listening", "Where do you meet people?", "At work")
    );
    view.rerender(microphone());
    for (const text of ["Where do you meet people?", "At work"]) {
      const paragraph = screen.getByText(text);
      expect(paragraph).toBeVisible();
      expect(paragraph).toHaveAttribute("aria-live", "off");
      expect(paragraph.closest('[aria-hidden="true"]')).toBeNull();
    }
    expect(screen.getByText(en.voice_listening)).toHaveAttribute(
      "aria-live",
      "polite"
    );
  });

  it("keeps the voice log readable and preserves keyboard toggling and focus", async () => {
    /* oxlint-disable vitest/max-expects -- Check accessibility and focus across one keyboard round trip. */
    const user = userEvent.setup();
    const view = render(microphone());
    const toggle = screen.getByRole("button", {
      name: `${en.voice_speaking}. ${en.voice_show_transcript}`,
    });
    toggle.focus();
    await user.keyboard("{Enter}");

    const log = screen.getByRole("log", { name: en.voice_show_transcript });
    expect(log).toHaveAttribute("aria-live", "off");
    expect(log).toHaveAttribute("tabindex", "0");
    expect(log.closest('[aria-hidden="true"]')).toBeNull();
    expect(within(log).getByText("Where do")).toBeVisible();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", log.id);
    expect(toggle).toHaveFocus();
    expect(pause).toHaveBeenCalledOnce();

    vi.mocked(useOnboardingLive).mockReturnValue(
      liveState("listening", "Where do you meet people?")
    );
    view.rerender(microphone());
    expect(within(log).getByText("Where do you meet people?")).toBeVisible();
    expect(log).toHaveAttribute("aria-live", "off");

    await user.tab({ shift: true });
    expect(
      screen.getByRole("button", { name: en.mode_switch_text })
    ).toHaveFocus();
    await user.tab({ shift: true });
    expect(log).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
    expect(resume).toHaveBeenCalledOnce();
    expect(screen.getByText(en.voice_listening)).toHaveAttribute(
      "aria-live",
      "polite"
    );
    /* oxlint-enable vitest/max-expects */
  });
});
