"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  countFilledEntries,
  deriveAcrosticProgressStatus,
  getStoredEntriesForDate,
  loadStoredAcrosticProgress,
} from "@/lib/acrostics-progress";
import {
  createMultiplayerSessionRecord,
  pruneStoredMultiplayerSessions,
  saveStoredMultiplayerSession,
} from "@/lib/acrostics-multiplayer";

export type StartMultiplayerButtonProps = {
  date: string;
  validNumbers: readonly number[];
};

type WarningKind = "completed" | "in_progress";

function getWarningCopy(kind: WarningKind) {
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

function buildSessionId(date: string) {
  const compactDate = date.replaceAll("-", "");
  const uuid = crypto.randomUUID().replaceAll("-", "");
  return `acr_${compactDate}_${uuid}`;
}

export function StartMultiplayerButton({
  date,
  validNumbers,
}: StartMultiplayerButtonProps) {
  const router = useRouter();
  const [warningKind, setWarningKind] = useState<WarningKind | null>(null);

  function launchSession() {
    const sessionId = buildSessionId(date);
    const hostRecord = createMultiplayerSessionRecord({
      sessionId,
      date,
      role: "host",
      clientId: crypto.randomUUID(),
      displayName: "Host",
    });

    pruneStoredMultiplayerSessions(window.localStorage);
    saveStoredMultiplayerSession(window.localStorage, hostRecord);
    router.push(`/multiplayer?date=${encodeURIComponent(date)}&session=${encodeURIComponent(sessionId)}`);
  }

  function handleStart() {
    if (typeof window === "undefined") {
      return;
    }

    const progressMap = loadStoredAcrosticProgress(window.localStorage);
    const storedEntries = getStoredEntriesForDate(progressMap, date, validNumbers);
    const filledCount = countFilledEntries(storedEntries, validNumbers);
    const progressStatus = deriveAcrosticProgressStatus(filledCount, validNumbers.length);

    if (progressStatus.kind === "completed" || progressStatus.kind === "in_progress") {
      setWarningKind(progressStatus.kind);
      return;
    }

    launchSession();
  }

  const warningCopy = warningKind ? getWarningCopy(warningKind) : null;

  return (
    <>
      <button
        className="rounded-full border border-[color:var(--accent-ink)] bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--foreground)] transition hover:bg-[#e4b53a]"
        onClick={handleStart}
        type="button"
      >
        Start multiplayer
      </button>

      {warningCopy ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgba(47,36,28,0.45)] px-4">
          <div className="w-full max-w-xl rounded-[2rem] border border-[color:var(--line)] bg-[color:var(--panel)] p-6 shadow-[0_30px_70px_-35px_rgba(26,18,11,0.65)]">
            <p
              className={
                warningKind === "completed"
                  ? "text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--danger-ink)]"
                  : "text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--accent-ink)]"
              }
            >
              {warningCopy.eyebrow}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
              {warningCopy.title}
            </h2>
            <p className="mt-4 text-base leading-7 text-[color:var(--muted)]">
              {warningCopy.body}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="rounded-full border border-[color:var(--line)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--foreground)] transition hover:bg-[color:var(--panel-strong)]"
                onClick={() => {
                  setWarningKind(null);
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className={[
                  "rounded-full border px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] transition",
                  warningCopy.buttonClass,
                ].join(" ")}
                onClick={() => {
                  setWarningKind(null);
                  launchSession();
                }}
                type="button"
              >
                Start fresh multiplayer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
