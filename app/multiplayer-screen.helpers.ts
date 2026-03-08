export function buildInviteUrl(sessionId: string, date: string) {
  if (typeof window === "undefined") {
    return `/multiplayer?date=${encodeURIComponent(date)}&session=${encodeURIComponent(sessionId)}`;
  }

  const url = new URL("/multiplayer", window.location.origin);
  url.searchParams.set("date", date);
  url.searchParams.set("session", sessionId);
  return url.toString();
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
