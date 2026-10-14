export async function encodePcmMp3(
  pcm: Buffer,
  sampleRate: number,
  outputPath: string,
  failureMessage: string
): Promise<void> {
  const encoder = Bun.spawn(
    [
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "s16le",
      "-ar",
      String(sampleRate),
      "-ac",
      "1",
      "-i",
      "pipe:0",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "64k",
      outputPath,
    ],
    { stdin: pcm, stdout: "ignore", stderr: "pipe" }
  );
  if ((await encoder.exited) !== 0) {
    throw new Error(failureMessage);
  }
}
