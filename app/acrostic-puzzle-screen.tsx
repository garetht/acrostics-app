"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  getStoredEntriesForDate,
  loadStoredAcrosticProgress,
  saveStoredEntriesForDate,
} from "@/lib/acrostics-progress";
import { normalizePuzzle, type XWordInfoPuzzle } from "./acrostic";
import { AcrosticBoard } from "./acrostic-board";
import { StartMultiplayerButton } from "./start-multiplayer-button";

export type AcrosticPuzzleScreenProps = {
  onProgressChange?: (filledCount: number) => void;
  puzzle: XWordInfoPuzzle;
  storageDate: string;
};

export function AcrosticPuzzleScreen({
  onProgressChange,
  puzzle,
  storageDate,
}: AcrosticPuzzleScreenProps) {
  const normalized = normalizePuzzle(puzzle);
  const gridNumbersKey = normalized.lookup.gridNumbersInOrder.join(",");
  const gridNumbersInOrder = useMemo(
    () =>
      gridNumbersKey
        .split(",")
        .filter(Boolean)
        .map((value) => Number.parseInt(value, 10)),
    [gridNumbersKey],
  );

  const [entriesByNumber, setEntriesByNumber] = useState<Record<number, string>>({});

  const hasHydratedStorageRef = useRef(false);
  const onProgressChangeRef = useRef(onProgressChange);
  const skipNextPersistRef = useRef(false);

  useEffect(() => {
    onProgressChangeRef.current = onProgressChange;
  }, [onProgressChange]);

  useEffect(() => {
    skipNextPersistRef.current = true;

    if (typeof window === "undefined") {
      return;
    }

    const progressMap = loadStoredAcrosticProgress(window.localStorage);
    const storedEntries = getStoredEntriesForDate(
      progressMap,
      storageDate,
      gridNumbersInOrder,
    );

    const hydrateFrame = window.requestAnimationFrame(() => {
      hasHydratedStorageRef.current = true;
      setEntriesByNumber(storedEntries);
    });

    return () => {
      window.cancelAnimationFrame(hydrateFrame);
    };
  }, [gridNumbersInOrder, storageDate]);

  useEffect(() => {
    if (!hasHydratedStorageRef.current || typeof window === "undefined") {
      return;
    }

    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    saveStoredEntriesForDate(window.localStorage, storageDate, entriesByNumber);
  }, [entriesByNumber, storageDate]);

  return (
    <div className="min-w-0">
      <main className="flex w-full flex-col gap-6">
        <header className="rounded-[2rem] border border-[color:var(--line)] bg-[color:var(--panel)] p-6 shadow-[0_24px_70px_-40px_rgba(60,36,18,0.45)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.38em] text-[color:var(--muted)]">
                Sunday Acrostic
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                Acrostic Solver
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">
                {normalized.meta.quote}
              </p>
            </div>

            <div className="flex flex-col gap-4 lg:items-end">
              <div className="text-sm text-[color:var(--muted)] lg:text-right">
                <p>{normalized.meta.date}</p>
                {normalized.meta.copyright ? (
                  <p>{normalized.meta.copyright}</p>
                ) : null}
              </div>
              <StartMultiplayerButton
                date={storageDate}
                validNumbers={gridNumbersInOrder}
              />
            </div>
          </div>
        </header>

        <AcrosticBoard
          entriesByNumber={entriesByNumber}
          onEntriesPatch={(changes) => {
            setEntriesByNumber((currentEntries) => {
              let nextEntries = currentEntries;

              for (const change of changes) {
                if (!Number.isInteger(change.number) || change.number <= 0) {
                  continue;
                }

                if (!change.value) {
                  if (!(change.number in nextEntries)) {
                    continue;
                  }

                  if (nextEntries === currentEntries) {
                    nextEntries = { ...currentEntries };
                  }

                  delete nextEntries[change.number];
                  continue;
                }

                if (currentEntries[change.number] === change.value) {
                  continue;
                }

                if (nextEntries === currentEntries) {
                  nextEntries = { ...currentEntries };
                }

                nextEntries[change.number] = change.value;
              }

              return nextEntries;
            });
          }}
          onProgressChange={(filledCount) => {
            onProgressChangeRef.current?.(filledCount);
          }}
          puzzle={puzzle}
        />
      </main>
    </div>
  );
}
