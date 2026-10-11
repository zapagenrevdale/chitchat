(async () => {
  const { OnboardingLive } = await import("/src/lib/onboarding-live.ts");
  const frames = [];
  const errors = [];
  const live = new OnboardingLive({
    onPhase: () => {},
    onMessages: (messages) => frames.push(messages.map(({ text }) => text)),
    onComplete: () => {},
    onError: (error) => errors.push(error),
  });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const part = (seconds) => {
    const bytes = new Uint8Array(24000 * 2 * seconds);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return { inlineData: { data: btoa(binary), mimeType: "audio/pcm;rate=24000" } };
  };
  const snapshot = () => ({ text: frames.at(-1)?.at(-1) ?? "", playing: live.playing });
  try {
    await live.audio.prepareOutput((error) => errors.push(error));
    live.connected = true;
    live.receive({ serverContent: {
      outputTranscription: { text: "What would you like to focus on practicing for your everyday conversations?" },
      modelTurn: { parts: [part(1)] },
    } });
    await wait(700);
    const streaming = snapshot();
    await wait(600);
    const stalled = snapshot();
    await wait(500);
    const stillStalled = snapshot();
    live.receive({ serverContent: {
      modelTurn: { parts: [part(3)] },
      generationComplete: true,
      turnComplete: true,
    } });
    await wait(900);
    const resumed = snapshot();
    live.receive({ serverContent: { interrupted: true } });
    const interrupted = snapshot();
    await wait(500);
    const afterInterruption = snapshot();
    return { streaming, stalled, stillStalled, resumed, interrupted, afterInterruption, errors };
  } finally {
    live.close();
  }
})()
