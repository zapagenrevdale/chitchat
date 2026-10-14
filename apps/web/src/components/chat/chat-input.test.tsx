import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatInput } from "./chat-input";

function Input({
  onSend,
  disabled = false,
  initial = "Hello",
}: {
  onSend: () => void | Promise<void>;
  disabled?: boolean;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ChatInput
      value={value}
      onChange={setValue}
      onSend={onSend}
      label="Message"
      placeholder="Reply"
      sendLabel="Send message"
      disabled={disabled}
    />
  );
}

describe(ChatInput, () => {
  afterEach(cleanup);

  it("submits Enter but preserves Shift+Enter and composition input", async () => {
    const send = vi.fn<() => void>();
    render(<Input onSend={send} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(send).not.toHaveBeenCalled();
    await act(() => fireEvent.keyDown(input, { key: "Enter" }));
    expect(send).toHaveBeenCalledOnce();
  });

  it("does not submit empty or disabled input, including Enter", () => {
    const send = vi.fn<() => void>();
    const { rerender } = render(<Input onSend={send} initial="   " />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(send).not.toHaveBeenCalled();
    rerender(<Input key="disabled" onSend={send} disabled />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(send).not.toHaveBeenCalled();
  });

  it("retains the controlled draft on failure so the caller can retry", async () => {
    const pending = Promise.withResolvers<null>();
    const send = vi.fn<() => Promise<void>>(async () => {
      await pending.promise;
    });
    render(<Input onSend={send} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(send).toHaveBeenCalledOnce();
    await act(() => pending.reject(new Error("Offline")));
    expect(input).toHaveValue("Hello");
    send.mockResolvedValueOnce();
    await act(() => fireEvent.keyDown(input, { key: "Enter" }));
    expect(send).toHaveBeenCalledTimes(2);
  });
});
