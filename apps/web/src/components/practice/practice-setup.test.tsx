import type {
  PracticeDraft,
  PracticeOptions,
  PracticeSelection,
} from "@chitchat/contracts";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolvePracticeSetup } from "@/lib/practice-api";

import { PracticeSetup } from "./practice-setup";

vi.mock(import("@/lib/practice-api"), () => ({
  resolvePracticeSetup: vi.fn<typeof resolvePracticeSetup>(),
}));
vi.mock(import("./use-persona-preview"), () => ({
  usePersonaPreview: () => ({
    play: vi.fn<() => Promise<void>>(),
    stop: vi.fn<() => void>(),
    status: null,
    error: null,
  }),
}));

const options: PracticeOptions = {
  personaGroups: [],
  available: true,
  places: [
    { id: "cafe", name: "Neighborhood café", description: "Coffee and a chat" },
    { id: "hotel", name: "Hotel", description: "Check in" },
  ],
  settings: [
    {
      id: "ordering",
      name: "Order something good",
      description: "Order a drink",
      placeIds: ["cafe"],
      objectives: [
        "Ask for a recommendation",
        "Place your order",
        "Ask a question",
      ],
    },
    {
      id: "casual",
      name: "A chance encounter",
      description: "Say hello",
      placeIds: [],
      objectives: ["Say hello", "Find common ground", "Ask a question"],
    },
  ],
  levels: [
    { id: "easy", name: "Keep it easy", description: "Simple questions" },
    {
      id: "balanced",
      name: "A little challenge",
      description: "A natural pace",
    },
    { id: "stretch", name: "Stretch myself", description: "Richer language" },
  ],
  personas: Array.from({ length: 30 }, (_, index) => ({
    id: index === 0 ? "maya" : `partner-${index}`,
    name: index === 0 ? "Maya" : `Partner ${index}`,
    description: "Warm and friendly",
    voice: "Kore",
    introduction: "Hello there",
    introductionAudio: "/audio/personas/maya.mp3",
    avatar: "/images/personas/maya.svg",
    gender: "Female",
    pitch: "Middle",
    tags: ["Warm"],
  })),
};
const ready: PracticeDraft = {
  placeId: "cafe",
  settingId: "ordering",
  difficulty: "easy",
  personaId: "maya",
};
function mount(initial: PracticeDraft = {}, available = true) {
  const start = vi.fn<(selection: PracticeSelection) => void>();
  function Harness() {
    const [selection, setSelection] = useState(initial);
    return (
      <PracticeSetup
        options={{ ...options, available }}
        selection={selection}
        onChange={setSelection}
        onStart={start}
      />
    );
  }
  render(<Harness />);
  return { user: userEvent.setup(), start };
}

describe("guided practice setup", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  it("shows one choice at a time and starts the exact previewed mission", async () => {
    const { user, start } = mount();
    expect(
      screen.getByRole("heading", { name: "Where do you want to practice?" })
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: /Neighborhood café Coffee/u })
    );
    expect(
      screen.getByRole("heading", { name: "What brings you here?" })
    ).toHaveFocus();
    await user.click(
      screen.getByRole("button", { name: /Order something good Order/u })
    );
    await user.click(
      screen.getByRole("button", { name: /Keep it easy Simple/u })
    );
    await user.click(screen.getByRole("button", { name: /Maya Warm/u }));
    expect(
      screen.getByRole("heading", { name: "Your mission is ready." })
    ).toBeVisible();
    expect(screen.getByText("Ask for a recommendation")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Start talking" }));
    expect(start).toHaveBeenCalledWith(ready);
  });

  it("keeps a situation supplied before its place visible and editable", () => {
    mount({ settingId: "ordering" });
    expect(
      screen.getByRole("heading", { name: "Where do you want to practice?" })
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Edit situation: Order something good",
      })
    ).toBeVisible();
  });

  it("lets users edit previous choices and revisits incompatible situations", async () => {
    const { user } = mount(ready);
    await user.click(
      screen.getByRole("button", { name: "Edit place: Neighborhood café" })
    );
    await user.click(screen.getByRole("button", { name: "Hotel Check in" }));
    expect(
      screen.getByRole("heading", { name: "What brings you here?" })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Order something good/u })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit challenge: Keep it easy" })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Edit partner: Maya" })
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "A chance encounter Say hello" })
    );
    expect(
      screen.getByRole("heading", { name: "Your mission is ready." })
    ).toBeVisible();
  });

  it("skips choices already supplied in a custom answer", async () => {
    vi.mocked(resolvePracticeSetup).mockResolvedValue({
      selection: {
        placeId: "custom",
        customPlace: "Hotel reception in Tokyo",
        settingId: "custom",
        customSetting: "Ask for a quiet room",
        difficulty: "easy",
      },
    });
    const { user } = mount();
    await user.type(
      screen.getByLabelText("Or make it your own"),
      "A quiet room at a Tokyo hotel, easy please"
    );
    await user.click(screen.getByRole("button", { name: "Use answer" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Who will you meet?" })
      ).toBeVisible()
    );
    expect(
      screen.getByRole("button", {
        name: "Edit place: Hotel reception in Tokyo",
      })
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Edit situation: Ask for a quiet room",
      })
    ).toBeVisible();
    expect(resolvePracticeSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "answer",
        step: "place",
        text: "A quiet room at a Tokyo hotel, easy please",
      }),
      expect.any(AbortSignal)
    );
  });

  it("offers single-step and complete randomization, and preserves level when shuffling", async () => {
    vi.mocked(resolvePracticeSetup)
      .mockResolvedValueOnce({ selection: { placeId: "cafe" } })
      .mockResolvedValueOnce({ selection: ready });
    const { user } = mount();
    await user.click(
      screen.getByRole("button", { name: "Surprise me Pick my place" })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "What brings you here?" })
      ).toBeVisible()
    );
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(
      screen.getByRole("button", { name: "Surprise me with everything" })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Your mission is ready." })
      ).toBeVisible()
    );
    vi.mocked(resolvePracticeSetup).mockResolvedValueOnce({
      selection: { ...ready, settingId: "casual" },
    });
    await user.click(screen.getByRole("button", { name: "Shuffle again" }));
    expect(resolvePracticeSetup).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "random-all", selection: ready }),
      expect.any(AbortSignal)
    );
    expect(
      screen.getByRole("button", { name: "Edit challenge: Keep it easy" })
    ).toBeVisible();
  });

  it("keeps an answer editable after an API failure", async () => {
    vi.mocked(resolvePracticeSetup).mockRejectedValue(
      new Error("Try again in a minute.")
    );
    const { user } = mount();
    await user.type(
      screen.getByLabelText("Or make it your own"),
      "A bookstore"
    );
    await user.click(screen.getByRole("button", { name: "Use answer" }));
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      "Try again in a minute."
    );
    expect(screen.getByLabelText("Or make it your own")).toHaveValue(
      "A bookstore"
    );
    expect(screen.getByRole("button", { name: "Use answer" })).toBeEnabled();
  });

  it("ignores late setup responses after navigating to edit another choice", async () => {
    const deferred = Promise.withResolvers<{ selection: PracticeDraft }>();
    vi.mocked(resolvePracticeSetup).mockReturnValue(deferred.promise);
    const { user } = mount(ready);
    await user.click(screen.getByRole("button", { name: "Shuffle again" }));
    const signal = vi.mocked(resolvePracticeSetup).mock.calls[0]?.[1];
    await user.click(
      screen.getByRole("button", { name: "Edit challenge: Keep it easy" })
    );
    expect(signal?.aborted).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Stretch myself Richer language" })
    );
    await act(async () => {
      deferred.resolve({ selection: ready });
      await deferred.promise;
    });
    expect(
      screen.getByRole("button", { name: "Edit challenge: Stretch myself" })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Edit challenge: Keep it easy" })
    ).not.toBeInTheDocument();
  });

  it("retains all 30 partners while showing a short initial list", async () => {
    const { user } = mount({
      placeId: "cafe",
      settingId: "ordering",
      difficulty: "easy",
    });
    expect(
      screen.getAllByRole("button", { name: /Hear .+ introduction/u })
    ).toHaveLength(6);
    await user.click(
      screen.getByRole("button", { name: "Explore all 30 partners" })
    );
    expect(
      screen.getAllByRole("button", { name: /Hear .+ introduction/u })
    ).toHaveLength(30);
  });

  it("keeps mission preview available when voice practice isn't configured", () => {
    mount(ready, false);
    expect(
      screen.getByRole("button", { name: "Start talking" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Shuffle again" })).toBeEnabled();
  });
});
