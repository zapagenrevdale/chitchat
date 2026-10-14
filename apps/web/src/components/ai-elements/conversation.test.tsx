import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Conversation, ConversationContent } from "./conversation";

describe(Conversation, () => {
  afterEach(cleanup);

  it("puts keyboard focus and live semantics on the scroll viewport", () => {
    const { rerender } = render(
      <Conversation>
        <ConversationContent aria-label="Messages">
          <p>Hello</p>
        </ConversationContent>
      </Conversation>
    );
    const log = screen.getByRole("log", { name: "Messages" });
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(log).toHaveClass("overflow-y-auto");
    log.focus();
    expect(log).toHaveFocus();
    rerender(
      <Conversation>
        <ConversationContent aria-label="Messages" aria-live="off">
          <p>Spoken reply</p>
        </ConversationContent>
      </Conversation>
    );
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "off");
    expect(screen.getAllByRole("log")).toHaveLength(1);
  });
});
