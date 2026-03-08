type WarningKind = "completed" | "in_progress";

export type MultiplayerWarningCopy = {
  body: string;
  buttonClass: string;
  eyebrow: string;
  title: string;
};

export function getWarningCopy(kind: WarningKind): MultiplayerWarningCopy {
  if (kind === "completed") {
    return {
      buttonClass:
        "border-[color:var(--danger)] bg-[color:var(--danger)] text-white hover:bg-[#b94f3f]",
      eyebrow: "Completed solo puzzle",
      title: "Start a fresh multiplayer board?",
      body: "This puzzle is already completed in solo mode. Multiplayer will start from a blank shared board and will not reuse or modify your solo answers.",
    };
  }

  return {
    buttonClass:
      "border-[color:var(--accent-ink)] bg-[color:var(--accent)] text-[color:var(--foreground)] hover:bg-[#e4b53a]",
    eyebrow: "Solo puzzle in progress",
    title: "Start multiplayer from a fresh board?",
    body: "This puzzle already has solo progress. Multiplayer keeps separate shared progress and will not copy or change your solo entries.",
  };
}

export function buildSessionId(
  date: string,
  createUuid: () => string = () => crypto.randomUUID(),
) {
  const compactDate = date.replaceAll("-", "");
  const uuid = createUuid().replaceAll("-", "");
  return `acr_${compactDate}_${uuid}`;
}
