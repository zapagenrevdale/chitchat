import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChitAvatar } from "@/components/ui/chit-avatar";

import { OnboardingMotivation } from "./onboarding-conversation";

vi.mock(import("@/components/ui/chit-avatar"), () => ({
  ChitAvatar: vi.fn<typeof ChitAvatar>(() => <span aria-hidden="true" />),
}));

function motivation(busy: boolean, waitingForReply = false) {
  return (
    <OnboardingMotivation
      busy={busy}
      waitingForReply={waitingForReply}
      name="Alex"
      introduction="Hello"
      value="Meet people"
      onChange={() => {}}
      onContinue={() => {}}
    />
  );
}

describe(OnboardingMotivation, () => {
  afterEach(cleanup);

  it("shows typing inside the conversation only while waiting for a reply", () => {
    const { rerender } = render(motivation(false));
    const status = screen.getByRole("status");
    expect(screen.getByRole("log")).toContainElement(status);
    expect(status).toBeEmptyDOMElement();
    rerender(motivation(true, true));
    expect(status).toHaveTextContent("Chit is typing...");
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(status).toHaveAttribute("aria-live", "polite");
    rerender(motivation(true));
    expect(status).toBeEmptyDOMElement();
    rerender(motivation(false));
    expect(status).toBeEmptyDOMElement();
  });

  it("keeps focus in transcript history when a reply finishes", () => {
    const { rerender } = render(motivation(false));
    expect(screen.getByRole("textbox")).toHaveFocus();
    rerender(motivation(true));
    const log = screen.getByRole("log");
    log.focus();
    rerender(motivation(false));
    expect(log).toHaveFocus();
  });

  it("restores input focus when disabling it left focus on the page", () => {
    const { rerender } = render(motivation(false));
    const input = screen.getByRole("textbox");
    input.blur();
    rerender(motivation(true));
    expect(document.body).toHaveFocus();
    rerender(motivation(false));
    expect(input).toHaveFocus();
  });
});
