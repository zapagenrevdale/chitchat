(async () => {
  const { OnboardingLive } = await import("/src/lib/onboarding-live.ts");
  const frames = [];
  const errors = [];
  const live = new OnboardingLive({
    onPhase: () => {},
    onMessages: (messages, confirmed) => frames.push({ messages, confirmed }),
    onComplete: () => {},
    onError: (error) => errors.push(error),
  });
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const pcm = (seconds) => {
    const bytes = new Uint8Array(24000 * 2 * seconds);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 8192) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }
    return { inlineData: { data: btoa(binary), mimeType: "audio/pcm;rate=24000" } };
  };
  const observation = () => ({
    messages: frames.at(-1)?.messages.map(({ text, final }) => ({ text, final })) ?? [],
    confirmed: frames.at(-1)?.confirmed ?? [],
    playing: live.playing,
  });
  try {
    await live.audio.prepareOutput((error) => errors.push(error));
    live.connected = true;
    live.receive({ serverContent: {
      outputTranscription: { text: "Hello there.", words: [
        { text: "Hello", startOffset: "0s", endOffset: "0.5s" },
        { text: "there.", startOffset: "0.5s", endOffset: "1.5s" },
      ] },
      modelTurn: { parts: [pcm(2)] },
      generationComplete: true,
      turnComplete: true,
    } });
    await wait(200);
    const early = observation();
    await wait(700);
    const middle = observation();
    await wait(1400);
    const drained = observation();
    live.receive({ serverContent: {
      outputTranscription: { text: "Untimed reply." },
      modelTurn: { parts: [pcm(1)] },
      generationComplete: true,
      turnComplete: true,
    } });
    await wait(200);
    const untimedEarly = observation();
    await wait(500);
    const untimedMiddle = observation();
    await wait(600);
    const untimedDrained = observation();
    return { early, middle, drained, untimedEarly, untimedMiddle, untimedDrained, errors };
  } finally {
    live.close();
  }
})()
