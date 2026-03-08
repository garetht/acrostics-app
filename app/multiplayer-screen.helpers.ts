import { buildUrlWithBasePath } from "@/lib/site-paths";

export function buildInviteUrl(sessionId: string, date: string) {
  return buildUrlWithBasePath("/multiplayer/", {
    date,
    session: sessionId,
  });
}

export function getPeerErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "Unable to establish the multiplayer connection.";
}
