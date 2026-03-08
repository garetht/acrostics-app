"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import {
  countFilledEntries,
  getStoredEntriesForDate,
  loadStoredAcrosticProgress,
  saveStoredEntriesForDate,
} from "@/lib/acrostics-progress";
import { normalizePuzzle, type XWordInfoPuzzle } from "./acrostic";

export type AcrosticPuzzleScreenProps = {
  onProgressChange?: (filledCount: number) => void;
  puzzle: XWordInfoPuzzle;
  storageDate: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function sanitizeLetters(value: string) {
  return value.toUpperCase().replace(/[^A-Z]/g, "");
}

export function AcrosticPuzzleScreen({
  onProgressChange,
  puzzle,
  storageDate,
}: AcrosticPuzzleScreenProps) {
  const normalized = normalizePuzzle(puzzle);
  const firstClue = normalized.clues[0];
  const firstClueId = firstClue?.id ?? "";
  const firstClueNumber = firstClue?.numbers[0] ?? null;
  const gridNumbersInOrder = normalized.lookup.gridNumbersInOrder;
  const gridNumbersKey = gridNumbersInOrder.join(",");

  const [entriesByNumber, setEntriesByNumber] = useState<Record<number, string>>({});
  const [activeClueId, setActiveClueId] = useState(firstClueId);
  const [activeNumber, setActiveNumber] = useState<number | null>(firstClueNumber);

  const clueInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const gridInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const focusSurfaceRef = useRef<"clue" | "grid">("clue");
  const hasHydratedStorageRef = useRef(false);
  const onProgressChangeRef = useRef(onProgressChange);
  const skipNextPersistRef = useRef(false);

  const activeClue =
    normalized.clues.find((clue) => clue.id === activeClueId) ??
    normalized.clues[0] ??
    null;

  function focusInput(number: number, surface: "clue" | "grid") {
    requestAnimationFrame(() => {
      const target =
        surface === "grid"
          ? gridInputRefs.current[number]
          : clueInputRefs.current[number] ?? gridInputRefs.current[number];

      target?.focus();
      target?.select();
    });
  }

  function updateEntry(number: number, nextValue: string) {
    setEntriesByNumber((currentEntries) => {
      if (!nextValue) {
        if (!(number in currentEntries)) {
          return currentEntries;
        }

        const nextEntries = { ...currentEntries };
        delete nextEntries[number];
        return nextEntries;
      }

      if (currentEntries[number] === nextValue) {
        return currentEntries;
      }

      return {
        ...currentEntries,
        [number]: nextValue,
      };
    });
  }

  function applyLetters(numbers: number[], letters: string) {
    if (letters.length === 0 || numbers.length === 0) {
      return;
    }

    setEntriesByNumber((currentEntries) => {
      const nextEntries = { ...currentEntries };

      numbers.forEach((number, index) => {
        const letter = letters[index];

        if (letter) {
          nextEntries[number] = letter;
        }
      });

      return nextEntries;
    });
  }

  function getSequence(number: number, surface: "clue" | "grid") {
    if (surface === "grid") {
      return gridNumbersInOrder;
    }

    const clueId = normalized.lookup.clueIdByNumber[number];
    return clueId ? normalized.lookup.numbersByClueId[clueId] ?? [] : [];
  }

  function setActivePosition(number: number, surface: "clue" | "grid") {
    const clueId = normalized.lookup.clueIdByNumber[number];
    focusSurfaceRef.current = surface;

    if (clueId && clueId !== activeClueId) {
      setActiveClueId(clueId);
    }

    if (number !== activeNumber) {
      setActiveNumber(number);
      return;
    }

    focusInput(number, surface);
  }

  function setActiveClue(
    clueId: string,
    surface: "clue" | "grid",
    preferredNumber?: number,
  ) {
    const numbers = normalized.lookup.numbersByClueId[clueId] ?? [];
    const targetNumber =
      preferredNumber && numbers.includes(preferredNumber)
        ? preferredNumber
        : numbers[0];

    focusSurfaceRef.current = surface;

    if (clueId !== activeClueId) {
      setActiveClueId(clueId);
    }

    if (typeof targetNumber === "number") {
      if (targetNumber !== activeNumber) {
        setActiveNumber(targetNumber);
      } else {
        focusInput(targetNumber, surface);
      }
    }
  }

  function moveAlongSequence(number: number, surface: "clue" | "grid", delta: number) {
    const sequence = getSequence(number, surface);
    const sequenceIndex = sequence.indexOf(number);
    const nextNumber = sequence[sequenceIndex + delta];

    if (typeof nextNumber === "number") {
      setActivePosition(nextNumber, surface);
    }
  }

  function handleCharacterEntry(number: number, surface: "clue" | "grid", rawValue: string) {
    const letters = sanitizeLetters(rawValue);
    const nextValue = letters.slice(-1);

    updateEntry(number, nextValue);

    if (nextValue) {
      moveAlongSequence(number, surface, 1);
    }
  }

  function handlePaste(
    event: ClipboardEvent<HTMLInputElement>,
    number: number,
    surface: "clue" | "grid",
  ) {
    event.preventDefault();

    const letters = sanitizeLetters(event.clipboardData.getData("text"));

    if (!letters) {
      return;
    }

    const sequence = getSequence(number, surface);
    const sequenceIndex = sequence.indexOf(number);

    if (sequenceIndex === -1) {
      return;
    }

    const targetNumbers = sequence.slice(sequenceIndex, sequenceIndex + letters.length);
    applyLetters(targetNumbers, letters);

    const nextNumber = sequence[sequenceIndex + targetNumbers.length] ?? targetNumbers.at(-1);

    if (typeof nextNumber === "number") {
      setActivePosition(nextNumber, surface);
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    number: number,
    surface: "clue" | "grid",
  ) {
    if (event.key === "Backspace") {
      event.preventDefault();

      if (entriesByNumber[number]) {
        updateEntry(number, "");
        return;
      }

      moveAlongSequence(number, surface, -1);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveAlongSequence(number, surface, -1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveAlongSequence(number, surface, 1);
      return;
    }

    if (surface !== "grid") {
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();

      const currentGridIndex = normalized.lookup.gridIndexByNumber[number];
      const direction = event.key === "ArrowUp" ? -normalized.cols : normalized.cols;
      let candidateIndex = currentGridIndex + direction;

      while (candidateIndex >= 0 && candidateIndex < normalized.grid.length) {
        const candidateCell = normalized.grid[candidateIndex];

        if (!candidateCell.isBlock && typeof candidateCell.number === "number") {
          setActivePosition(candidateCell.number, "grid");
          break;
        }

        candidateIndex += direction;
      }
    }
  }

  useEffect(() => {
    onProgressChangeRef.current = onProgressChange;
  }, [onProgressChange]);

  useEffect(() => {
    setActiveClueId(firstClueId);
    setActiveNumber(firstClueNumber);
    focusSurfaceRef.current = "clue";
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

    hasHydratedStorageRef.current = true;
    setEntriesByNumber(storedEntries);
  }, [firstClueId, firstClueNumber, gridNumbersKey, storageDate]);

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

  useEffect(() => {
    onProgressChangeRef.current?.(countFilledEntries(entriesByNumber, gridNumbersInOrder));
  }, [entriesByNumber, gridNumbersKey]);

  useEffect(() => {
    if (typeof activeNumber === "number") {
      focusInput(activeNumber, focusSurfaceRef.current);
    }
  }, [activeNumber]);

  if (!activeClue) {
    return null;
  }

  const activeNumbers = activeClue.numbers;
  const titleCellCount = Math.max(1, normalized.titleCells.length);

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

            <div className="text-sm text-[color:var(--muted)]">
              <p>{normalized.meta.date}</p>
              {normalized.meta.copyright ? <p>{normalized.meta.copyright}</p> : null}
            </div>
          </div>
        </header>

        <section className="rounded-[2rem] border border-[color:var(--line)] bg-[color:var(--panel)] p-5 shadow-[0_18px_40px_-30px_rgba(60,36,18,0.4)] md:p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
            Active clue
          </p>
          <div className="mt-3 flex flex-col gap-4">
            <p className="text-xl font-semibold leading-8 tracking-[-0.02em] text-[color:var(--foreground)] md:text-[1.65rem]">
              <span className="mr-3 text-[color:var(--accent-ink)]">{activeClue.label}.</span>
              {activeClue.text}
            </p>

            <div className="flex flex-wrap gap-2">
              {activeNumbers.map((number) => {
                const isActive = number === activeNumber;

                return (
                  <label
                    key={`clue-${number}`}
                    className={cx(
                      "relative flex h-[4.5rem] w-14 items-stretch overflow-hidden rounded-[1.1rem] border transition-all",
                      isActive
                        ? "border-[color:var(--accent-ink)] bg-[color:var(--accent)] shadow-[0_12px_30px_-18px_rgba(124,71,17,0.7)]"
                        : "border-[color:var(--line)] bg-[color:var(--panel-strong)]",
                    )}
                  >
                    <span className="pointer-events-none absolute left-2 top-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.15em] text-[color:var(--muted)]">
                      {number}
                    </span>
                    <input
                      ref={(node) => {
                        clueInputRefs.current[number] = node;
                      }}
                      aria-label={`Clue ${activeClue.label} cell ${number}`}
                      autoCapitalize="characters"
                      autoComplete="off"
                      className="h-full w-full bg-transparent px-2 pb-2 pt-6 text-center text-[1.9rem] font-semibold uppercase text-[color:var(--foreground)] outline-none"
                      inputMode="text"
                      maxLength={1}
                      onChange={(event) => {
                        handleCharacterEntry(number, "clue", event.target.value);
                      }}
                      onFocus={() => {
                        setActivePosition(number, "clue");
                      }}
                      onKeyDown={(event) => {
                        handleKeyDown(event, number, "clue");
                      }}
                      onPaste={(event) => {
                        handlePaste(event, number, "clue");
                      }}
                      spellCheck={false}
                      value={entriesByNumber[number] ?? ""}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[color:var(--line)] bg-[color:var(--panel)] p-3 shadow-[0_18px_40px_-30px_rgba(60,36,18,0.4)] md:p-4">
          <div className="mb-4 flex items-center justify-between px-2">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
              Quote grid
            </p>
            <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
              {normalized.rows} rows x {normalized.cols} cols
            </p>
          </div>

          <div className="overflow-x-auto pb-2">
            <div
              className="grid w-max gap-px rounded-[1.75rem] border border-[color:var(--line)] bg-[color:var(--line)] p-px"
              style={{
                gridTemplateColumns: `repeat(${normalized.cols}, minmax(2.9rem, 2.9rem))`,
              }}
            >
              {normalized.grid.map((cell) => {
                if (cell.isBlock || typeof cell.number !== "number") {
                  return (
                    <div
                      key={`block-${cell.index}`}
                      aria-hidden="true"
                      className="h-[3.75rem] bg-[#2f3136]"
                    />
                  );
                }

                const cellNumber = cell.number;
                const isActive = cellNumber === activeNumber;
                const isInActiveClue = activeNumbers.includes(cellNumber);

                return (
                  <label
                    key={`grid-${cellNumber}`}
                    className={cx(
                      "relative flex h-[3.75rem] items-stretch overflow-hidden transition-colors",
                      isActive
                        ? "bg-[color:var(--accent)]"
                        : isInActiveClue
                          ? "bg-[color:var(--accent-soft)]"
                          : "bg-[color:var(--panel-strong)]",
                    )}
                  >
                    <span className="pointer-events-none absolute left-1.5 top-1 text-[0.66rem] font-medium text-[color:var(--muted)]">
                      {cellNumber}
                    </span>
                    <span className="pointer-events-none absolute right-1.5 top-1 text-[0.68rem] font-semibold text-[color:var(--muted)]">
                      {cell.clueLabel}
                    </span>
                    <input
                      ref={(node) => {
                        gridInputRefs.current[cellNumber] = node;
                      }}
                      aria-label={`Quote grid cell ${cellNumber}`}
                      autoCapitalize="characters"
                      autoComplete="off"
                      className="h-full w-full bg-transparent px-1 pt-4 text-center text-[1.35rem] font-semibold uppercase text-[color:var(--foreground)] outline-none"
                      inputMode="text"
                      maxLength={1}
                      onChange={(event) => {
                        handleCharacterEntry(cellNumber, "grid", event.target.value);
                      }}
                      onFocus={() => {
                        setActivePosition(cellNumber, "grid");
                      }}
                      onKeyDown={(event) => {
                        handleKeyDown(event, cellNumber, "grid");
                      }}
                      onPaste={(event) => {
                        handlePaste(event, cellNumber, "grid");
                      }}
                      spellCheck={false}
                      value={entriesByNumber[cellNumber] ?? ""}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[color:var(--line)] bg-[color:var(--panel)] p-4 shadow-[0_18px_40px_-30px_rgba(60,36,18,0.4)] md:p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
            Author and title
          </p>
          <div className="mt-3 overflow-x-auto pb-2">
            <div
              className="grid w-max gap-px rounded-[1.3rem] border border-[color:var(--line)] bg-[color:var(--line)] p-px"
              style={{
                gridTemplateColumns: `repeat(${titleCellCount}, minmax(2.9rem, 2.9rem))`,
              }}
            >
              {normalized.titleCells.map((cell) => {
                const isActive = cell.clueId === activeClue.id;

                return (
                  <button
                    key={`title-${cell.sourceNumber}`}
                    className={cx(
                      "relative flex h-12 items-center justify-center bg-[color:var(--panel-strong)] text-center transition-colors",
                      isActive && "bg-[color:var(--accent)]",
                    )}
                    onClick={() => {
                      setActiveClue(cell.clueId, "clue", cell.sourceNumber);
                    }}
                    type="button"
                  >
                    <span className="absolute left-1.5 top-1 text-[0.68rem] font-semibold text-[color:var(--muted)]">
                      {cell.label}
                    </span>
                    <span className="text-xl font-semibold uppercase text-[color:var(--foreground)]">
                      {entriesByNumber[cell.sourceNumber] ?? ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-3 text-sm italic text-[color:var(--muted)]">
            Author and title from the first letter of each answer.
          </p>
        </section>

        <section className="rounded-[2rem] border border-[color:var(--line)] bg-[color:var(--panel)] p-5 shadow-[0_18px_40px_-30px_rgba(60,36,18,0.4)] md:p-6">
          <p className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--accent-ink)]">
            Click any clue or number below to go directly to that location
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {normalized.clues.map((clue) => {
              const isActive = clue.id === activeClue.id;

              return (
                <button
                  key={clue.id}
                  className={cx(
                    "flex items-start gap-3 rounded-[1.35rem] border px-4 py-3 text-left transition-all",
                    isActive
                      ? "border-[color:var(--accent-ink)] bg-[color:var(--accent-soft)]"
                      : "border-transparent bg-transparent hover:border-[color:var(--line)] hover:bg-[color:var(--panel-strong)]",
                  )}
                  onClick={() => {
                    setActiveClue(clue.id, "clue");
                  }}
                  type="button"
                >
                  <span className="min-w-6 text-lg font-semibold text-[color:var(--accent-ink)]">
                    {clue.label}.
                  </span>
                  <span className="text-base leading-7 text-[color:var(--foreground)]">
                    {clue.text}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
