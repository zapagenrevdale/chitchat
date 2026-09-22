import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlaceImage } from "./place-image";

// JSDOM has no layout measurements; exercise modal behavior with reduced motion.
vi.mock(import("motion/react"), async (importOriginal) => ({
  ...(await importOriginal()),
  useReducedMotion: () => true,
}));

const place = { name: "Cafe", description: "A quiet cafe." };

describe("place image preview", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads a preset image immediately without requesting generation", () => {
    const fetchImage = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchImage);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <PlaceImage
          place={place}
          imageSrc="/images/places/neighborhood-cafe.png"
        />
      </QueryClientProvider>
    );
    expect(
      screen.getByRole("img", { name: place.description })
    ).toHaveAttribute("src", "/images/places/neighborhood-cafe.png");
    expect(screen.queryByText("Imagining your place…")).not.toBeInTheDocument();
    expect(fetchImage).not.toHaveBeenCalled();
    client.clear();
  });

  it("shows a generated image and reuses it when revisiting a place", async () => {
    const fetchImage = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ image: "data:image/png;base64,YQ==" })
      );
    vi.stubGlobal("fetch", fetchImage);
    const client = new QueryClient();
    const view = render(
      <QueryClientProvider client={client}>
        <PlaceImage place={place} />
      </QueryClientProvider>
    );
    await expect(
      screen.findByRole("img", { name: place.description })
    ).resolves.toHaveAttribute("src", "data:image/png;base64,YQ==");
    view.unmount();
    render(
      <QueryClientProvider client={client}>
        <PlaceImage place={place} />
      </QueryClientProvider>
    );
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(fetchImage).toHaveBeenCalledOnce();
    client.clear();
  });

  it("offers an explicit retry after generation fails", async () => {
    const fetchImage = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(
        Response.json({ image: "data:image/png;base64,YQ==" })
      );
    vi.stubGlobal("fetch", fetchImage);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <PlaceImage place={place} />
      </QueryClientProvider>
    );
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Try again" }));
    await expect(screen.findByRole("img")).resolves.toBeInTheDocument();
    expect(fetchImage).toHaveBeenCalledTimes(2);
    client.clear();
  });

  it("opens the photo dialog and restores focus after Escape", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ image: "data:image/png;base64,YQ==" })
        )
    );
    const client = new QueryClient();
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <PlaceImage place={place} />
      </QueryClientProvider>
    );
    const trigger = await screen.findByRole("button", {
      name: "Enlarge Cafe photo",
    });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Cafe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close photo" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Close photo" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(trigger).toHaveFocus();
    client.clear();
  });
});
