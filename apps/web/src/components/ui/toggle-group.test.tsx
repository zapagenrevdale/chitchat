import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";

import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

afterEach(cleanup);

it.each([
  ["vertical", "{ArrowDown}"],
  ["horizontal", "{ArrowRight}"],
] as const)("supports %s keyboard navigation", async (orientation, key) => {
  const user = userEvent.setup();
  render(
    <ToggleGroup
      type="single"
      orientation={orientation}
      aria-label="Preview state"
    >
      <ToggleGroupItem value="idle">Idle</ToggleGroupItem>
      <ToggleGroupItem value="speaking">Speaking</ToggleGroupItem>
    </ToggleGroup>
  );
  await user.click(screen.getByRole("radio", { name: "Idle" }));
  await user.keyboard(key);
  await waitFor(() =>
    expect(screen.getByRole("radio", { name: "Speaking" })).toHaveFocus()
  );
  await user.keyboard(" ");
  expect(screen.getByRole("radio", { name: "Speaking" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
});
