import type {
  CustomPlaceSummary,
  PracticeOptions,
  PracticeSelection,
} from "@chitchat/contracts";
import type { OnboardingProfile } from "@chitchat/contracts/onboarding";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { practiceOptionsQuery } from "@/lib/practice-api";
import type * as LiveModule from "@/lib/practice-live";

import { PracticeDesign } from "./practice-design";

type Callbacks = ConstructorParameters<typeof LiveModule.PracticeLive>[0];
const connections = vi.hoisted(
  () =>
    [] as {
      callbacks: Callbacks;
      close: ReturnType<typeof vi.fn<() => void>>;
      place?: CustomPlaceSummary;
      selection?: PracticeSelection;
    }[]
);
let clips: HTMLAudioElement[];
const previewFixture = {
  title: "A coffee and a little conversation.",
  description: "Maya is waiting for coffee. There is time for a chat.",
  goal: "Find one shared interest.",
};
const fetchPractice = vi.fn<typeof fetch>();

vi.mock(import("@/lib/practice-live"), () => ({
  PracticeLive: class {
    callbacks: Callbacks;
    place?: CustomPlaceSummary;
    close = vi.fn<() => void>();
    constructor(callbacks: Callbacks) {
      this.callbacks = callbacks;
      connections.push(this);
    }
    finish() {
      this.callbacks.onState("reviewing");
      this.callbacks.onFeedback?.({ status: "insufficient" });
      this.close();
      this.callbacks.onState("ended");
    }
    selection?: PracticeSelection;
    start(selection: PracticeSelection) {
      this.selection = selection;
      this.callbacks.onState("starting");
      return Promise.resolve();
    }
    startCustomPlace() {
      this.callbacks.onState("starting");
      return Promise.resolve();
    }
    startCustomSituation(place: CustomPlaceSummary) {
      this.place = place;
      return this.startCustomPlace();
    }
    getAnalyser = vi.fn<() => AnalyserNode | null>().mockReturnValue(null);
  } as unknown as typeof LiveModule.PracticeLive,
}));
vi.mock(import("@/components/ui/live-waveform"), () => ({
  LiveWaveform: () => <div data-testid="live-waveform" />,
}));
vi.mock(import("@/components/ui/watercolor-wave"), () => ({
  WatercolorWave: () => <div data-testid="watercolor-wave" />,
}));

function latestConnection() {
  const connection = connections.at(-1);
  if (!connection) {
    throw new Error("No live connection was started.");
  }
  return connection;
}
const summary = {
  name: "Rainy bookshop",
  description:
    "A quiet bookshop with wooden shelves and a coffee counter on a rainy evening.",
};
const situationSummary = {
  name: "Ask about a food allergy",
  description:
    "Ask the server which dishes are safe for your allergy and choose a meal.",
};
const options: PracticeOptions = {
  available: true,
  places: [],
  personaGroups: [
    { id: "fun", name: "Fun", personaIds: ["maya", "leo"] },
    { id: "calm", name: "Calm", personaIds: ["sam"] },
  ],
  personas: [
    {
      id: "maya",
      name: "Maya",
      description: "Bright and optimistic",
      voice: "Kore",
      introduction: "Hi, I'm Maya!",
      introductionAudio: "/audio/personas/maya.mp3",
      avatar: "/images/personas/maya.svg",
      gender: "Female",
      pitch: "Middle",
      tags: ["Bright", "Optimistic"],
    },
    {
      id: "leo",
      name: "Leo",
      description: "Casual and energetic",
      voice: "Puck",
      introduction: "Hi, I'm Leo!",
      introductionAudio: "/audio/personas/leo.mp3",
      avatar: "/images/personas/leo.svg",
      gender: "Male",
      pitch: "Middle",
      tags: ["Casual", "Energetic"],
    },
    {
      id: "sam",
      name: "Sam",
      description: "Calm and thoughtful",
      voice: "Charon",
      introduction: "Hi, I'm Sam.",
      introductionAudio: "/audio/personas/sam.mp3",
      avatar: "/images/personas/sam.svg",
      gender: "Male",
      pitch: "Lower",
      tags: ["Calm", "Thoughtful"],
    },
  ],
  levels: [],
  settings: [
    {
      id: "casual",
      name: "A chance encounter",
      description: "Turn an everyday moment into a conversation.",
      placeIds: [],
      objectives: ["Say hello", "Find common ground", "Ask a question"],
    },
    {
      id: "ordering",
      name: "Order something good",
      description: "Order a drink or a meal and ask for a recommendation.",
      placeIds: ["cafe", "restaurant"],
      objectives: [
        "Ask for a recommendation",
        "Place your order",
        "Ask a question",
      ],
    },
    {
      id: "check-in",
      name: "Check in",
      description: "Check in at reception.",
      placeIds: ["hotel"],
      objectives: [
        "Introduce yourself",
        "Ask about your stay",
        "Get a recommendation",
      ],
    },
  ],
};

function renderDesign(profile?: OnboardingProfile) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(practiceOptionsQuery.queryKey, options);
  return render(
    <QueryClientProvider client={queryClient}>
      <PracticeDesign profile={profile} />
    </QueryClientProvider>
  );
}

describe("practice design", () => {
  beforeEach(() => {
    connections.length = 0;
    clips = [];
    fetchPractice
      .mockReset()
      .mockImplementation((input) =>
        Promise.resolve(
          Response.json(
            String(input).endsWith("/scene-previews")
              ? previewFixture
              : { image: "data:image/png;base64,YQ==" }
          )
        )
      );
    vi.stubGlobal("fetch", fetchPractice);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.stubGlobal(
      "Audio",
      // Audio is called with `new`; an arrow mock is not constructible.
      // oxlint-disable-next-line prefer-arrow-callback
      vi.fn(function MockAudio(src: string) {
        const audio = document.createElement("audio");
        audio.src = src;
        clips.push(audio);
        return audio;
      })
    );
    vi.stubGlobal("AudioWorkletNode", vi.fn<() => void>());
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn<() => void>() },
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function startConversation() {
    const user = userEvent.setup();
    renderDesign();
    await user.click(
      screen.getByRole("button", { name: "Describe a custom place with Chit" })
    );
    return { user, connection: latestConnection() };
  }

  async function chooseScene(user: ReturnType<typeof userEvent.setup>) {
    renderDesign();
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    await user.click(screen.getByRole("button", { name: "Select persona" }));
  }

  it("carries onboarding language and selected goals into the live session", async () => {
    const user = userEvent.setup();
    renderDesign({
      version: 1,
      name: "Alex",
      language: "Japanese",
      motivation: "Make friends",
      skills: ["listening", "wit"],
    });
    expect(
      screen.getByRole("combobox", { name: "Practice language" })
    ).toHaveValue("Japanese");
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    await user.click(screen.getByRole("button", { name: "Select persona" }));
    await screen.findByRole("heading", { name: previewFixture.title });
    await user.click(screen.getByRole("button", { name: "Talk with Maya" }));
    expect(latestConnection().selection).toMatchObject({
      language: "Japanese",
      learner: { name: "Alex", skills: ["listening", "wit"] },
    });
    expect(latestConnection().selection).not.toHaveProperty("motivation");
  });

  it("offers 26 languages and starts practice in Filipino", async () => {
    const user = userEvent.setup();
    await chooseScene(user);
    const picker = screen.getByRole("combobox", { name: "Practice language" });
    expect(within(picker).getAllByRole("option")).toHaveLength(26);
    await user.selectOptions(picker, "Filipino");
    await screen.findByRole("heading", { name: previewFixture.title });
    await user.click(screen.getByRole("button", { name: "Talk with Maya" }));
    expect(latestConnection().selection?.language).toBe("Filipino");
    expect(
      screen.queryByRole("combobox", { name: "Practice language" })
    ).not.toBeInTheDocument();
  });

  it("waits for an AI preview and includes the checked goal when starting", async () => {
    const user = userEvent.setup();
    const pending = Promise.withResolvers<Response>();
    fetchPractice.mockReturnValueOnce(pending.promise);
    await chooseScene(user);
    expect(
      screen.getByRole("button", { name: "Talk with Maya" })
    ).toBeDisabled();
    expect(screen.getByText("Chit is setting the scene…")).toBeInTheDocument();
    await act(async () => {
      pending.resolve(Response.json(previewFixture));
      await pending.promise;
    });
    await screen.findByRole("heading", { name: previewFixture.title });
    expect(
      screen.getByRole("checkbox", { name: previewFixture.goal })
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Talk with Maya" }));
    expect(latestConnection().selection).toMatchObject({
      scenePreview: {
        title: previewFixture.title,
        description: previewFixture.description,
      },
      goal: previewFixture.goal,
    });
  });

  it("saves a backstory into the new AI scene and omits an unchecked goal from voice practice", async () => {
    const user = userEvent.setup();
    await chooseScene(user);
    const goal = await screen.findByRole("checkbox", {
      name: previewFixture.goal,
    });
    await user.click(goal);
    await user.click(screen.getByRole("button", { name: "Add backstory" }));
    await user.type(
      screen.getByRole("textbox", { name: "Your backstory" }),
      "We are old teammates catching up."
    );
    expect(fetchPractice).toHaveBeenCalledOnce();
    const updated = {
      title: "A familiar face.",
      description: "Maya recognizes you from the team.",
      goal: "Ask how the team is doing.",
    };
    fetchPractice.mockResolvedValueOnce(Response.json(updated));
    await user.click(screen.getByRole("button", { name: "Update scene" }));
    await screen.findByRole("heading", { name: updated.title });
    expect(
      JSON.parse(String(fetchPractice.mock.calls.at(-1)?.[1]?.body))
    ).toMatchObject({
      backstory: "We are old teammates catching up.",
      personaId: "maya",
    });
    expect(
      screen.getByRole("checkbox", { name: updated.goal })
    ).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Talk with Maya" }));
    expect(latestConnection().selection).toMatchObject({
      backstory: "We are old teammates catching up.",
      scenePreview: { title: updated.title, description: updated.description },
    });
    expect(latestConnection().selection).not.toHaveProperty("goal");
  });

  it("cancels unsaved backstory edits without generating or changing the scene", async () => {
    const user = userEvent.setup();
    await chooseScene(user);
    await screen.findByRole("heading", { name: previewFixture.title });
    await user.click(screen.getByRole("button", { name: "Add backstory" }));
    await user.type(
      screen.getByRole("textbox", { name: "Your backstory" }),
      "Discard this draft."
    );
    expect(
      screen.getByRole("button", { name: "Talk with Maya" })
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchPractice).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Talk with Maya" }));
    expect(latestConnection().selection).not.toHaveProperty("backstory");
  });

  it("cancels outdated generation when saving a backstory and ignores its late response", async () => {
    const user = userEvent.setup();
    const pending = Promise.withResolvers<Response>();
    fetchPractice.mockReturnValueOnce(pending.promise);
    await chooseScene(user);
    const signal = fetchPractice.mock.calls[0]?.[1]?.signal;
    await user.click(screen.getByRole("button", { name: "Add backstory" }));
    await user.type(
      screen.getByRole("textbox", { name: "Your backstory" }),
      "We met last week."
    );
    const updated = { ...previewFixture, title: "A second hello." };
    fetchPractice.mockResolvedValueOnce(Response.json(updated));
    await user.click(screen.getByRole("button", { name: "Update scene" }));
    await screen.findByRole("heading", { name: updated.title });
    expect(signal?.aborted).toBeTruthy();
    await act(async () => {
      pending.resolve(Response.json(previewFixture));
      await pending.promise;
    });
    expect(
      screen.queryByRole("heading", { name: previewFixture.title })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: updated.title })
    ).toBeInTheDocument();
  });

  it("lets a failed AI preview be retried without starting a conversation", async () => {
    const user = userEvent.setup();
    fetchPractice.mockResolvedValueOnce(
      Response.json(
        { error: "Chit couldn’t prepare your scene. Please try again." },
        { status: 502 }
      )
    );
    await chooseScene(user);
    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: "Talk with Maya" })
    ).toBeDisabled();
    expect(connections).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: previewFixture.title });
    expect(
      screen.getByRole("button", { name: "Talk with Maya" })
    ).toBeEnabled();
  });

  it("asks Chit for scene recommendations and selects the first ranked persona", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    const pending = Promise.withResolvers<Response>();
    fetchPractice.mockReturnValueOnce(pending.promise);
    const wand = screen.getByRole("button", {
      name: "Ask Chit to recommend personas",
    });
    await user.click(wand);
    expect(wand).toBeDisabled();
    const call = fetchPractice.mock.calls.at(-1);
    expect(call?.[0]).toContain("/persona-recommendations");
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      place: { name: "neighborhood cafe" },
      situation: { name: "A chance encounter" },
    });
    await act(async () => {
      pending.resolve(
        Response.json({
          name: "Chit's picks",
          personaIds: ["sam", "leo", "maya"],
        })
      );
      await pending.promise;
    });
    expect(
      screen.getAllByRole("radio").map((item) => item.textContent)
    ).toStrictEqual(["Sam", "Leo", "Maya"]);
    await user.click(screen.getByRole("button", { name: "Select persona" }));
    await user.click(screen.getByRole("button", { name: /^Talk with /u }));
    expect(latestConnection().selection?.personaId).toBe("sam");
  });

  it("keeps the existing group on recommendation failure and allows retry", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    fetchPractice.mockResolvedValueOnce(
      Response.json({ error: "Chit is unavailable." }, { status: 502 })
    );
    const wand = screen.getByRole("button", {
      name: "Ask Chit to recommend personas",
    });
    await user.click(wand);
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      "Chit is unavailable."
    );
    expect(
      screen.getByRole("radiogroup", { name: "Fun personas" })
    ).toBeInTheDocument();
    expect(wand).toBeEnabled();
    fetchPractice.mockResolvedValueOnce(
      Response.json({ name: "Recommended", personaIds: ["sam", "leo", "maya"] })
    );
    await user.click(wand);
    await expect(
      screen.findByRole("radiogroup", { name: "Recommended personas" })
    ).resolves.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("starts the selected conversation and returns to the scene after ending", async () => {
    const user = userEvent.setup();
    renderDesign();
    expect(
      screen.queryByRole("button", { name: /^Talk with /u })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    await user.click(screen.getByRole("button", { name: "Select persona" }));
    await user.click(screen.getByRole("button", { name: /^Talk with /u }));
    const connection = latestConnection();
    expect(connection.selection).toStrictEqual({
      language: "English",
      placeId: "cafe",
      settingId: options.settings[0].id,
      personaId: "maya",
      scenePreview: {
        title: previewFixture.title,
        description: previewFixture.description,
      },
      goal: previewFixture.goal,
    });
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "End conversation" }));
    expect(connection.close).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Practice again" }));
    expect(
      within(screen.getByRole("list", { name: "Practice checklist" }))
        .getAllByRole("checkbox", { checked: true })
        .map((item) => item.textContent)
    ).toStrictEqual(["neighborhood cafe", "A chance encounter", "Maya"]);
  });

  it("keeps streaming messages and earlier replies in the conversation", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    await user.click(screen.getByRole("button", { name: "Select persona" }));
    await user.click(screen.getByRole("button", { name: /^Talk with /u }));
    const connection = latestConnection();
    expect(screen.getByTestId("watercolor-wave")).toBeInTheDocument();
    act(() => {
      connection.callbacks.onMessage?.({
        id: 1,
        speaker: "partner",
        text: "Hello",
      });
      connection.callbacks.onMessage?.({
        id: 1,
        speaker: "partner",
        text: "Hello there!",
      });
      connection.callbacks.onMessage?.({ id: 2, speaker: "user", text: "Hi!" });
      connection.callbacks.onMessage?.({
        id: 3,
        speaker: "partner",
        text: "How are you?",
      });
    });
    const messages = screen.getByRole("log", { name: "Conversation messages" });
    expect(within(messages).getByText("Hello there!")).toBeInTheDocument();
    expect(within(messages).getByText("Hi!")).toBeInTheDocument();
    expect(within(messages).getByText("How are you?")).toBeInTheDocument();
    expect(within(messages).queryByText("Hello")).not.toBeInTheDocument();
  });

  it("confirms the browsed place in a checklist and lets you uncheck it to choose again", async () => {
    const user = userEvent.setup();
    renderDesign();

    await user.click(screen.getByRole("button", { name: "Next place" }));
    await user.click(screen.getByRole("button", { name: "Select place" }));

    const restaurant = screen.getByRole("checkbox", { name: "restaurant" });
    expect(restaurant).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Select situation" })
    ).toHaveFocus();

    await user.click(restaurant);
    expect(screen.getByRole("button", { name: "Select place" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Next place" }));
    await user.click(screen.getByRole("button", { name: "Select place" }));
    expect(screen.getByRole("checkbox", { name: "airport" })).toBeChecked();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("adds a situation below the place and reopens it with the keyboard", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Next situation" }));
    expect(
      screen.getByText("Order a drink or a meal and ask for a recommendation.")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    expect(
      screen.getByRole("checkbox", { name: "Order something good" })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "neighborhood cafe" })
    ).toBeChecked();
    screen.getByRole("checkbox", { name: "Order something good" }).focus();
    await user.keyboard(" ");
    expect(screen.getByLabelText("Selected situation")).toHaveTextContent(
      "order something good"
    );
    expect(
      screen.getByRole("button", { name: "Select situation" })
    ).toHaveFocus();
  });

  it("shows matching avatars and only the personas in the current group", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Select situation" }));

    expect(screen.getByLabelText("Selected persona group")).toHaveTextContent(
      "Fun"
    );
    expect(screen.getByRole("radio", { name: "Maya" })).toBeChecked();
    expect(
      within(screen.getByRole("radio", { name: "Leo" })).getByRole(
        "presentation"
      )
    ).toHaveAttribute("src", "/images/personas/leo.svg");
    expect(
      screen.queryByRole("radio", { name: "Sam" })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Next persona group" })
    );
    expect(screen.getByRole("radio", { name: "Sam" })).toBeChecked();
  });

  it("wraps through persona groups in both directions", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    await user.click(
      screen.getByRole("button", { name: "Next persona group" })
    );
    expect(screen.getByLabelText("Selected persona group")).toHaveTextContent(
      "Calm"
    );
    expect(
      screen.queryByRole("radio", { name: "Maya" })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Next persona group" })
    );
    expect(screen.getByLabelText("Selected persona group")).toHaveTextContent(
      "Fun"
    );
    await user.click(
      screen.getByRole("button", { name: "Previous persona group" })
    );
    expect(screen.getByLabelText("Selected persona group")).toHaveTextContent(
      "Calm"
    );
  });

  it("confirms the chosen persona and avatar in the checklist and reopens its group", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    await user.click(
      screen.getByRole("button", { name: "Next persona group" })
    );
    await user.click(screen.getByRole("button", { name: "Select persona" }));

    const sam = screen.getByRole("checkbox", { name: "Sam" });
    expect(sam).toBeChecked();
    expect(sam).toHaveFocus();
    expect(within(sam).getByRole("presentation")).toHaveAttribute(
      "src",
      "/images/personas/sam.svg"
    );

    await user.keyboard(" ");
    expect(screen.getByLabelText("Selected persona group")).toHaveTextContent(
      "Calm"
    );
    expect(screen.getByRole("radio", { name: "Sam" })).toBeChecked();
  });

  it("keeps scene images hidden while preparing text previews after changing choices", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    await user.click(screen.getByRole("button", { name: "Select persona" }));
    expect(
      fetchPractice.mock.calls.some(([url]) =>
        String(url).includes("/place-images")
      )
    ).toBeFalsy();
    expect(
      screen.queryByRole("button", { name: "Enlarge neighborhood cafe photo" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "Generating practice scene" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Maya" }));
    await user.click(screen.getByRole("radio", { name: "Leo" }));
    await user.click(screen.getByRole("button", { name: "Select persona" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Talk with Leo" })
      ).toBeEnabled()
    );
    expect(
      fetchPractice.mock.calls.some(([url]) =>
        String(url).includes("/place-images")
      )
    ).toBeFalsy();
  });

  it("changes the persona with the keyboard and clears it when editing the situation", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    screen.getByRole("radio", { name: "Maya" }).focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Leo" })).toBeChecked()
    );
    await user.click(screen.getByRole("button", { name: "Select persona" }));
    expect(screen.getByRole("checkbox", { name: "Leo" })).toBeChecked();

    await user.click(
      screen.getByRole("checkbox", { name: "A chance encounter" })
    );
    expect(
      screen.queryByRole("checkbox", { name: "Leo" })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    expect(screen.getByRole("radio", { name: "Maya" })).toBeChecked();
  });

  it("plays the pressed persona, replaces the previous clip, and replays on another press", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    expect(clips).toHaveLength(0);

    await user.click(screen.getByRole("radio", { name: "Maya" }));
    expect(clips[0]?.getAttribute("src")).toBe("/audio/personas/maya.mp3");
    await user.click(screen.getByRole("radio", { name: "Leo" }));
    expect(clips[0]?.hasAttribute("src")).toBeFalsy();
    expect(clips[1]?.getAttribute("src")).toBe("/audio/personas/leo.mp3");
    await user.click(screen.getByRole("radio", { name: "Leo" }));
    expect(clips).toHaveLength(3);
  });

  it("stops previews when changing groups, pressing stop, or confirming the persona", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    await user.click(screen.getByRole("radio", { name: "Maya" }));
    await user.click(
      screen.getByRole("button", { name: "Next persona group" })
    );
    expect(clips[0]?.hasAttribute("src")).toBeFalsy();
    expect(clips).toHaveLength(1);

    await user.click(screen.getByRole("radio", { name: "Sam" }));
    await user.click(
      screen.getByRole("button", { name: "Stop persona preview" })
    );
    expect(clips[1]?.hasAttribute("src")).toBeFalsy();
    screen.getByRole("radio", { name: "Sam" }).focus();
    await user.keyboard("{Enter}");
    expect(clips[2]?.getAttribute("src")).toBe("/audio/personas/sam.mp3");
    await user.click(screen.getByRole("button", { name: "Select persona" }));
    expect(clips[2]?.hasAttribute("src")).toBeFalsy();
  });

  it("clears the previous situation when editing the place and offers compatible situations", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Next situation" }));
    await user.click(screen.getByRole("button", { name: "Select situation" }));
    await user.click(
      screen.getByRole("checkbox", { name: "neighborhood cafe" })
    );
    await user.click(screen.getByRole("button", { name: "Previous place" }));
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(screen.getByRole("button", { name: "Next situation" }));
    expect(screen.getByLabelText("Selected situation")).toHaveTextContent(
      "check in"
    );
    expect(screen.getByRole("checkbox", { name: "hotel" })).toBeChecked();
    expect(
      screen.queryByRole("checkbox", { name: "Order something good" })
    ).not.toBeInTheDocument();
  });

  it("automatically selects the confirmed situation and opens the persona picker", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(screen.getByRole("button", { name: "Next place" }));
    await user.click(screen.getByRole("button", { name: "Select place" }));
    await user.click(
      screen.getByRole("button", {
        name: "Describe a custom situation with Chit",
      })
    );
    const connection = latestConnection();
    expect(connection.place).toMatchObject({ name: "restaurant" });
    expect(screen.getByRole("checkbox", { name: "restaurant" })).toBeDisabled();
    act(() => connection.callbacks.onSituationSummary?.(situationSummary));
    expect(
      screen.getByRole("checkbox", { name: situationSummary.name })
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Select persona" })
    ).toHaveFocus();
    expect(connection.close).toHaveBeenCalledOnce();
  });

  it("replaces the voice button with the conversation and disables the selector", async () => {
    await startConversation();
    expect(
      screen.queryByRole("button", {
        name: "Describe a custom place with Chit",
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous place" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next place" })).toBeDisabled();
    expect(screen.getByTestId("live-waveform")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel custom place conversation" })
    ).toHaveFocus();
  });

  it("shows the most recent speaker's transcript", async () => {
    const { connection } = await startConversation();
    act(() => {
      connection.callbacks.onState("talking");
      connection.callbacks.onTranscript({
        user: "",
        partner: "What kind of place are you imagining?",
      });
    });
    expect(
      screen.getByText("What kind of place are you imagining?")
    ).toBeInTheDocument();
    act(() =>
      connection.callbacks.onTranscript({
        user: "A quiet bookshop.",
        partner: "What kind of place are you imagining?",
      })
    );
    expect(screen.getByText("A quiet bookshop.")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("waits for a fresh transcript when a call is closed and reopened", async () => {
    const { user, connection } = await startConversation();
    const opening = "What kind of place are you imagining?";
    act(() => connection.callbacks.onState("listening"));
    expect(screen.queryByText(opening)).not.toBeInTheDocument();

    act(() => {
      connection.callbacks.onState("talking");
      connection.callbacks.onTranscript({ user: "", partner: opening });
    });
    expect(screen.getByText(opening)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Cancel custom place conversation" })
    );
    await user.click(
      screen.getByRole("button", { name: "Describe a custom place with Chit" })
    );

    const restarted = latestConnection();
    act(() => {
      restarted.callbacks.onState("listening");
      connection.callbacks.onTranscript({ user: "", partner: opening });
    });
    expect(screen.queryByText(opening)).not.toBeInTheDocument();
    act(() => {
      restarted.callbacks.onState("talking");
      restarted.callbacks.onTranscript({
        user: "",
        partner: "Hi, I'm Chit.",
      });
    });
    expect(screen.getByText("Hi, I'm Chit.")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Cancel custom place conversation" })
    );
  });

  it("automatically selects the confirmed place and starts discussing its situation", async () => {
    const { connection } = await startConversation();
    act(() => connection.callbacks.onPlaceSummary?.(summary));
    expect(screen.getByRole("checkbox", { name: summary.name })).toBeChecked();
    expect(connection.close).not.toHaveBeenCalled();
    expect(connections).toHaveLength(1);
    expect(
      screen.getByRole("button", {
        name: "Cancel custom situation conversation",
      })
    ).toHaveFocus();
  });

  it("ignores duplicate place completion and accepts the next situation summary", async () => {
    const { connection } = await startConversation();
    act(() => connection.callbacks.onPlaceSummary?.(summary));
    act(() => connection.callbacks.onPlaceSummary?.(summary));
    expect(connections).toHaveLength(1);
    act(() =>
      latestConnection().callbacks.onSituationSummary?.(situationSummary)
    );
    expect(
      screen.getByRole("checkbox", { name: situationSummary.name })
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Select persona" })
    ).toBeEnabled();
  });

  it("confirms a custom place and preserves it when reopening the picker", async () => {
    const { user, connection } = await startConversation();
    act(() => connection.callbacks.onPlaceSummary?.(summary));
    await user.click(
      screen.getByRole("button", {
        name: "Cancel custom situation conversation",
      })
    );
    expect(screen.getByRole("checkbox", { name: summary.name })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: summary.name }));
    expect(screen.getByLabelText("Selected place")).toHaveTextContent(
      summary.name
    );
    expect(screen.getByText(summary.description)).toBeInTheDocument();
    expect(connection.close).toHaveBeenCalledOnce();
  });

  it("keeps the custom place available when browsing the preset places", async () => {
    const { user, connection } = await startConversation();
    act(() => connection.callbacks.onPlaceSummary?.(summary));
    await user.click(
      screen.getByRole("button", {
        name: "Cancel custom situation conversation",
      })
    );
    await user.click(screen.getByRole("checkbox", { name: summary.name }));
    await user.click(screen.getByRole("button", { name: "Next place" }));
    expect(screen.getByLabelText("Selected place")).toHaveTextContent(
      "neighborhood cafe"
    );
    await waitFor(() =>
      expect(screen.queryByText(summary.description)).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Previous place" }));
    expect(screen.getByLabelText("Selected place")).toHaveTextContent(
      summary.name
    );
  });

  it("cancels during connection and ignores late events from the canceled session", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(
      screen.getByRole("button", { name: "Describe a custom place with Chit" })
    );
    const oldConnection = latestConnection();
    await user.click(
      screen.getByRole("button", { name: "Cancel custom place conversation" })
    );
    expect(oldConnection.close).toHaveBeenCalledOnce();
    await user.click(
      screen.getByRole("button", { name: "Describe a custom place with Chit" })
    );
    act(() => {
      oldConnection.callbacks.onPlaceSummary?.(summary);
      oldConnection.callbacks.onError("Stale error");
      oldConnection.callbacks.onState("ended");
    });
    expect(screen.getByRole("button", { name: "Next place" })).toBeDisabled();
    expect(screen.queryByText("Stale error")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Selected place")).toHaveTextContent(
      "neighborhood cafe"
    );
    await user.keyboard("{Escape}");
  });

  it("releases the microphone on Escape and restores preset selection", async () => {
    const { user, connection } = await startConversation();
    await user.keyboard("{Escape}");
    expect(connection.close).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Next place" })).toBeEnabled();
  });

  it("restores controls after microphone failure and releases a retry on navigation", async () => {
    const user = userEvent.setup();
    const { unmount } = renderDesign();
    await user.click(
      screen.getByRole("button", { name: "Describe a custom place with Chit" })
    );
    act(() => {
      latestConnection().callbacks.onError("Microphone access was blocked.");
      latestConnection().callbacks.onState("ended");
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Microphone access was blocked."
    );
    expect(
      screen.getByRole("button", { name: "Previous place" })
    ).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: "Describe a custom place with Chit" })
    );
    expect(connections).toHaveLength(2);
    unmount();
    expect(latestConnection().close).toHaveBeenCalledOnce();
  });
});
