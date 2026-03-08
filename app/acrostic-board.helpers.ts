import type { AcrosticBoardPresence } from "./acrostic-board";

export function sanitizeLetters(value: string) {
  return value.toUpperCase().replace(/[^A-Z]/g, "");
}

export function describeRemotePresence(
  presence: AcrosticBoardPresence | null | undefined,
) {
  if (!presence) {
    return null;
  }

  if (
    typeof presence.activeNumber === "number" &&
    typeof presence.activeClueId === "string"
  ) {
    return `${presence.displayName} editing clue ${presence.activeClueId} / cell ${presence.activeNumber}`;
  }

  if (typeof presence.activeNumber === "number") {
    return `${presence.displayName} editing cell ${presence.activeNumber}`;
  }

  if (typeof presence.activeClueId === "string") {
    return `${presence.displayName} editing clue ${presence.activeClueId}`;
  }

  return `${presence.displayName} is on the board`;
}
