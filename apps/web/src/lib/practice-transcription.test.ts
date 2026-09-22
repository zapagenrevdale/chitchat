import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PracticeTranscription } from "./practice-transcription";

class Socket extends EventTarget {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  binaryType = "blob";
  url: string;
  send = vi.fn<(data: string) => void>();
  close = vi.fn<() => void>();
  constructor(url: URL) {
    super();
    this.url = url.toString();
    Socket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  message(data: object) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(data) })
    );
  }
}
function setup() {
  const callbacks = {
    onTurn: vi.fn<(id: string) => void>(),
    onText: vi.fn<(id: string, text: string) => void>(),
    onFailure: vi.fn<() => void>(),
  };
  const captions = new PracticeTranscription(callbacks);
  const started = captions.start(
    "auth_tokens/captions",
    new AbortController().signal
  );
  const socket = Socket.instances.at(-1);
  if (!socket) {
    throw new Error("Missing socket");
  }
  socket.open();
  socket.message({ setupComplete: {} });
  return { captions, callbacks, socket, started };
}

describe("Gemini caption transport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Socket.instances = [];
    vi.stubGlobal("WebSocket", Socket);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("connects with a constrained token and streams native-rate PCM", async () => {
    const { captions, socket, started } = setup();
    await started;
    expect(new URL(socket.url).searchParams.get("access_token")).toBe(
      "auth_tokens/captions"
    );
    expect(JSON.parse(socket.send.mock.calls[0]?.[0] ?? "null")).toStrictEqual({
      setup: { model: "models/gemini-3.5-transcribe-live" },
    });
    captions.sendAudio("pcm", 48_000);
    expect(
      JSON.parse(socket.send.mock.calls.at(-1)?.[0] ?? "null")
    ).toStrictEqual({
      realtimeInput: {
        audio: { data: "pcm", mimeType: "audio/pcm;rate=48000" },
      },
    });
    captions.close();
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it("replaces interim hypotheses and commits each authoritative segment", async () => {
    const { captions, socket, callbacks, started } = setup();
    await started;
    socket.message({
      serverContent: { interimInputTranscription: { text: "I went too" } },
    });
    socket.message({
      serverContent: {
        interimInputTranscription: { text: "I went to the cafe" },
      },
    });
    socket.message({
      serverContent: { inputTranscription: { text: "I went to the cafe." } },
    });
    socket.message({
      serverContent: { inputTranscription: { text: "Yesterday." } },
    });
    expect(callbacks.onTurn.mock.calls).toStrictEqual([["1"], ["2"]]);
    expect(callbacks.onText.mock.calls).toStrictEqual([
      ["1", "I went too"],
      ["1", "I went to the cafe"],
      ["1", "I went to the cafe."],
      ["2", "Yesterday."],
    ]);
    captions.close();
  });

  it("drains all final segments before freezing feedback captions", async () => {
    const { captions, socket, callbacks, started } = setup();
    await started;
    const finished = captions.finish();
    expect(
      JSON.parse(socket.send.mock.calls.at(-1)?.[0] ?? "null")
    ).toStrictEqual({ realtimeInput: { audioStreamEnd: true } });
    socket.message({
      serverContent: {
        inputTranscription: { text: "See you.", finished: true },
      },
    });
    expect(socket.close).not.toHaveBeenCalled();
    socket.message({
      serverContent: { inputTranscription: { text: "Tomorrow." } },
    });
    await vi.advanceTimersByTimeAsync(3000);
    await finished;
    socket.message({ serverContent: { inputTranscription: { text: "late" } } });
    expect(callbacks.onText).toHaveBeenLastCalledWith("2", "Tomorrow.");
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it("signals silence on mute and accepts audio again afterward", async () => {
    const { captions, socket, started } = setup();
    await started;
    captions.endAudio();
    expect(
      JSON.parse(socket.send.mock.calls.at(-1)?.[0] ?? "null")
    ).toStrictEqual({ realtimeInput: { audioStreamEnd: true } });
    captions.sendAudio("resumed", 44_100);
    expect(
      JSON.parse(socket.send.mock.calls.at(-1)?.[0] ?? "null")
    ).toStrictEqual({
      realtimeInput: {
        audio: { data: "resumed", mimeType: "audio/pcm;rate=44100" },
      },
    });
    captions.close();
  });

  it("falls back once when the caption stream fails or exceeds its send budget", async () => {
    const { captions, socket, callbacks, started } = setup();
    await started;
    socket.bufferedAmount = 256_001;
    captions.sendAudio("pcm", 48_000);
    socket.message({ error: { code: 503 } });
    expect(callbacks.onFailure).toHaveBeenCalledOnce();
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it("cancels a pending handshake and closes its socket", async () => {
    const captions = new PracticeTranscription({
      onTurn: () => {},
      onText: () => {},
      onFailure: () => {},
    });
    const controller = new AbortController();
    const started = captions.start("auth_tokens/captions", controller.signal);
    controller.abort(new Error("cancelled"));
    await expect(started).rejects.toThrow("cancelled");
    expect(Socket.instances[0]?.close).toHaveBeenCalledOnce();
  });
});
