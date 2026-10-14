import type { ConversationSkill } from "@chitchat/contracts/conversation-goals";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import { OnboardingSkills } from "./onboarding-choices";

function Choices() {
  const [skills, setSkills] = useState<ConversationSkill[]>([]);
  return (
    <OnboardingSkills
      value={skills}
      suggested={["sharing"]}
      onChange={setSkills}
    />
  );
}
describe("skill choices", () => {
  afterEach(cleanup);

  it("offers eleven unselected skills and associates the recommendation with its checkbox", () => {
    render(<Choices />);
    const sharing = screen.getByRole("checkbox", {
      name: en.skill_sharing_title,
    });
    expect(screen.getAllByRole("checkbox")).toHaveLength(11);
    expect(sharing).not.toBeChecked();
    expect(sharing).toHaveAccessibleDescription(
      `${en.skill_sharing_description} ${en.skill_suggested}`
    );
  });

  it("lets the learner select three, deselect with the keyboard, and choose another skill", async () => {
    const user = userEvent.setup();
    render(<Choices />);
    const first = screen.getByRole("checkbox", {
      name: en.skill_start_conversations_title,
    });
    const sharing = screen.getByRole("checkbox", {
      name: en.skill_sharing_title,
    });
    await user.click(first);
    await user.click(sharing);
    await user.click(
      screen.getByRole("checkbox", { name: en.skill_listening_title })
    );
    const wit = screen.getByRole("checkbox", { name: en.skill_wit_title });
    expect(wit).toBeDisabled();
    first.focus();
    await user.keyboard(" ");
    expect(first).toHaveFocus();
    expect(first).not.toBeChecked();
    expect(wit).toBeEnabled();
    await user.click(wit);
    expect(screen.getByRole("status")).toHaveTextContent("3 of 3 selected");
  });
});
