import { onboardingBenefitIds } from "@chitchat/contracts/onboarding";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import { OnboardingBenefits } from "./onboarding-benefits";

function renderRecommendations() {
  render(
    <OnboardingBenefits
      ids={["start-conversations", "listen-and-connect", "keep-it-going"]}
    />
  );
}

describe("additional onboarding benefits", () => {
  afterEach(cleanup);

  it("reveals only remaining outcomes with titles and no descriptions", async () => {
    const user = userEvent.setup();
    renderRecommendations();
    const toggle = screen.getByRole("button", { name: en.help_show_more });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("region", { name: en.help_more_title })
    ).toBeNull();
    await user.click(toggle);
    const region = screen.getByRole("region", { name: en.help_more_title });
    expect(within(region).getAllByRole("listitem")).toHaveLength(13);
    expect([
      within(region).queryByText(en.help_start_conversations_title),
      within(region).queryByText(en.help_listen_and_connect_title),
      within(region).queryByText(en.help_keep_it_going_title),
      within(region).queryByText(en.help_useful_feedback_text),
    ]).toStrictEqual([null, null, null, null]);
    expect(
      within(region).getByText(en.help_useful_feedback_title)
    ).toBeInTheDocument();
  });

  it("restores disclosure focus on Escape and supports reopening with the keyboard", async () => {
    const user = userEvent.setup();
    renderRecommendations();
    const toggle = screen.getByRole("button", { name: en.help_show_more });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    screen
      .getByRole("button", { name: en.help_think_on_your_feet_title })
      .focus();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("region", { name: en.help_more_title })
    ).toBeNull();
    expect(toggle).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("region", { name: en.help_more_title })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: en.help_show_less }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("omits the disclosure when every outcome is already displayed", () => {
    render(<OnboardingBenefits ids={onboardingBenefitIds} />);
    expect(
      screen.queryByRole("button", { name: en.help_show_more })
    ).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(16);
  });
});
