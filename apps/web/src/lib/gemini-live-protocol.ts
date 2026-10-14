export function constrainedLiveUrl(
  token: string,
  version: "v1alpha" | "v1beta"
): URL {
  const url = new URL(
    `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${version}.GenerativeService.BidiGenerateContentConstrained`
  );
  url.searchParams.set("access_token", token);
  return url;
}

export function liveFrameText(data: string | ArrayBuffer): string {
  return typeof data === "string" ? data : new TextDecoder().decode(data);
}
