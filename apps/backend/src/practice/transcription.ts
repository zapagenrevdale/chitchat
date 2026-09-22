import {
  AudioTranscriptionConfigMode,
  GoogleGenAI,
  Modality,
} from "@google/genai";

export type CreateTranscriptionSession = (
  signal: AbortSignal
) => Promise<string>;

export function createGeminiTranscription(
  apiKey: string
): CreateTranscriptionSession {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: "v1alpha", timeout: 5000 },
  });
  return async (signal) => {
    const token = await ai.authTokens.create({
      config: {
        abortSignal: signal,
        uses: 1,
        expireTime: new Date(Date.now() + 15 * 60_000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
        liveConnectConstraints: {
          model: "gemini-3.5-transcribe-live",
          config: {
            responseModalities: [Modality.TEXT],
            inputAudioTranscription: {
              mode: AudioTranscriptionConfigMode.VERBATIM,
            },
          },
        },
      },
    });
    signal.throwIfAborted();
    if (!token.name) {
      throw new Error("Gemini returned no transcription token.");
    }
    return token.name;
  };
}
