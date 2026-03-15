"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import { countFilledEntries } from "@/lib/acrostics-progress";
import { normalizePuzzle, type XWordInfoPuzzle } from "./acrostic";
import {
  describeRemotePresence,
  sanitizeLetters,
} from "./acrostic-board.helpers";

export type AcrosticEditorPatch = {
  number: number;
  value: string;
};

export type AcrosticEditorSurface = "clue" | "grid";

export type AcrosticBoardPresence = {
  displayName: string;
  activeClueId: string | null;
  activeNumber: number | null;
  surface: AcrosticEditorSurface;
  isTyping: boolean;
};

export type AcrosticBoardProps = {
  entriesByNumber: Record<number, string>;
  isReadOnly?: boolean;
  onEntriesPatch: (changes: AcrosticEditorPatch[]) => void;
  onPresenceChange?: (presence: {
    activeClueId: string | null;
    activeNumber: number | null;
    surface: AcrosticEditorSurface;
    isTyping: boolean;
  }) => void;
  onProgressChange?: (filledCount: number) => void;
  puzzle: XWordInfoPuzzle;
  remoteFlashNumbers?: readonly number[];
  remotePresence?: AcrosticBoardPresence | null;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function buildResponsiveGridTemplateColumns(columnCount: number) {
  const gapWidth = Math.max(0, columnCount - 1);
  return `repeat(${columnCount}, minmax(var(--board-grid-cell-size), calc((100% - ${gapWidth}px) / ${columnCount})))`;
}

export function AcrosticBoard({
  entriesByNumber,
  isReadOnly = false,
  onEntriesPatch,
  onPresenceChange,
  onProgressChange,
  puzzle,
  remoteFlashNumbers = [],
  remotePresence,
}: AcrosticBoardProps) {
  const normalized = normalizePuzzle(puzzle);
  const firstClue = normalized.clues[0];
  const firstClueId = firstClue?.id ?? "";
  const firstClueNumber = firstClue?.numbers[0] ?? null;
  const gridNumbersInOrder = normalized.lookup.gridNumbersInOrder;
  const remoteFlashNumberSet = new Set(remoteFlashNumbers);

  const [activeClueId, setActiveClueId] = useState(firstClueId);
  const [activeNumber, setActiveNumber] = useState<number | null>(firstClueNumber);
  const [isTyping, setIsTyping] = useState(false);

  const clueInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const gridInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const focusSurfaceRef = useRef<AcrosticEditorSurface>("clue");
  const onProgressChangeRef = useRef(onProgressChange);
  const typingResetTimeoutRef = useRef<number | null>(null);

  const activeClue =
    normalized.clues.find((clue) => clue.id === activeClueId) ??
    normalized.clues[0] ??
    null;

  function focusInput(number: number, surface: AcrosticEditorSurface) {
    requestAnimationFrame(() => {
      if (isReadOnly) {
        return;
      }

      const target =
        surface === "grid"
          ? gridInputRefs.current[number]
          : clueInputRefs.current[number] ?? gridInputRefs.current[number];

      target?.focus();
      target?.select();
    });
  }

  function pulseTyping() {
    if (typingResetTimeoutRef.current) {
      window.clearTimeout(typingResetTimeoutRef.current);
    }

    setIsTyping(true);
    typingResetTimeoutRef.current = window.setTimeout(() => {
      setIsTyping(false);
      typingResetTimeoutRef.current = null;
    }, 900);
  }

  function getSequence(number: number, surface: AcrosticEditorSurface) {
    if (surface === "grid") {
      return gridNumbersInOrder;
    }

    const clueId = normalized.lookup.clueIdByNumber[number];
    return clueId ? normalized.lookup.numbersByClueId[clueId] ?? [] : [];
  }

  function setActivePosition(number: number, surface: AcrosticEditorSurface) {
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
    surface: AcrosticEditorSurface,
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

  function moveAlongSequence(
    number: number,
    surface: AcrosticEditorSurface,
    delta: number,
  ) {
    const sequence = getSequence(number, surface);
    const sequenceIndex = sequence.indexOf(number);
    const nextNumber = sequence[sequenceIndex + delta];

    if (typeof nextNumber === "number") {
      setActivePosition(nextNumber, surface);
    }
  }

  const filledCount = countFilledEntries(entriesByNumber, gridNumbersInOrder);

  useEffect(() => {
    onProgressChangeRef.current?.(filledCount);
  }, [filledCount]);

  useEffect(() => {
    if (typeof activeNumber === "number") {
      requestAnimationFrame(() => {
        if (isReadOnly) {
          return;
        }

        const target =
          focusSurfaceRef.current === "grid"
            ? gridInputRefs.current[activeNumber]
            : clueInputRefs.current[activeNumber] ?? gridInputRefs.current[activeNumber];

        target?.focus();
        target?.select();
      });
    }
  }, [activeNumber, isReadOnly]);

  useEffect(() => {
    onPresenceChange?.({
      activeClueId: activeClueId || null,
      activeNumber,
      surface: focusSurfaceRef.current,
      isTyping,
    });
  }, [activeClueId, activeNumber, isTyping, onPresenceChange]);

  useEffect(() => {
    return () => {
      if (typingResetTimeoutRef.current) {
        window.clearTimeout(typingResetTimeoutRef.current);
      }
    };
  }, []);

  function handleCharacterEntry(
    number: number,
    surface: AcrosticEditorSurface,
    rawValue: string,
  ) {
    const letters = sanitizeLetters(rawValue);
    const nextValue = letters.slice(-1);

    onEntriesPatch([{ number, value: nextValue }]);
    pulseTyping();

    if (nextValue) {
      moveAlongSequence(number, surface, 1);
    }
  }

  function handlePaste(
    event: ClipboardEvent<HTMLInputElement>,
    number: number,
    surface: AcrosticEditorSurface,
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

    onEntriesPatch(
      targetNumbers.map((targetNumber, index) => ({
        number: targetNumber,
        value: letters[index] ?? "",
      })),
    );
    pulseTyping();

    const nextNumber = sequence[sequenceIndex + targetNumbers.length] ?? targetNumbers.at(-1);

    if (typeof nextNumber === "number") {
      setActivePosition(nextNumber, surface);
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    number: number,
    surface: AcrosticEditorSurface,
  ) {
    if (event.key === "Backspace") {
      event.preventDefault();

      if (entriesByNumber[number]) {
        onEntriesPatch([{ number, value: "" }]);
        pulseTyping();
        moveAlongSequence(number, surface, -1);
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

  if (!activeClue) {
    return null;
  }

  const activeNumbers = activeClue.numbers;
  const titleCellCount = Math.max(1, normalized.titleCells.length);
  const remotePresenceText = describeRemotePresence(remotePresence);

  return (
    <>
      <section className="rounded-[2rem] border border-[color:var(--line)] bg-[color:var(--panel)] p-[var(--surface-padding)] shadow-[0_18px_40px_-30px_rgba(60,36,18,0.4)] md:p-[var(--surface-padding-lg)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
              Active clue
            </p>
            {remotePresenceText ? (
              <p className="mt-2 text-sm font-semibold text-[color:var(--remote-ink)]">
                {remotePresenceText}
                {remotePresence?.isTyping ? "..." : ""}
              </p>
            ) : null}
          </div>
          {isReadOnly ? (
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--remote-ink)]">
              Waiting for host
            </p>
          ) : null}
        </div>

        <div className="mt-2.5 flex flex-col gap-3">
          <p className="text-xl font-semibold leading-8 tracking-[-0.02em] text-[color:var(--foreground)] md:text-[1.65rem]">
            <span className="mr-3 text-[color:var(--accent-ink)]">{activeClue.label}.</span>
            {activeClue.text}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {activeNumbers.map((number) => {
              const isActive = number === activeNumber;
              const isRemoteActive = remotePresence?.activeNumber === number;
              const isRemoteFlash = remoteFlashNumberSet.has(number);

              return (
                <label
                  key={`clue-${number}`}
                  className={cx(
                    "relative flex h-[var(--board-clue-chip-height)] w-[var(--board-clue-chip-width)] items-stretch overflow-hidden rounded-[1rem] border transition-all",
                    isActive
                      ? "border-[color:var(--accent-ink)] bg-[color:var(--accent)] shadow-[0_12px_30px_-18px_rgba(124,71,17,0.7)]"
                      : isRemoteActive
                        ? "border-[color:var(--remote-accent)] bg-[color:var(--remote-soft)]"
                        : "border-[color:var(--line)] bg-[color:var(--panel-strong)]",
                    isRemoteFlash && "ring-2 ring-inset ring-[color:var(--remote-accent)]",
                  )}
                >
                  <span className="pointer-events-none absolute left-1.5 top-1 text-[0.68rem] font-semibold uppercase tracking-[0.15em] text-[color:var(--muted)]">
                    {number}
                  </span>
                  <input
                    ref={(node) => {
                      clueInputRefs.current[number] = node;
                    }}
                    aria-label={`Clue ${activeClue.label} cell ${number}`}
                    autoCapitalize="characters"
                    autoComplete="off"
                    className="h-full w-full bg-transparent px-1.5 pb-1.5 pt-5 text-center text-[1.7rem] font-semibold uppercase text-[color:var(--foreground)] outline-none disabled:cursor-not-allowed disabled:text-[color:var(--muted)]"
                    disabled={isReadOnly}
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

      <section className="rounded-[2rem] border border-[color:var(--line)] bg-[color:var(--panel)] p-2.5 shadow-[0_18px_40px_-30px_rgba(60,36,18,0.4)] md:p-3">
        <div className="mb-3 flex items-center justify-between px-1.5">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
            Quote grid
          </p>
          <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
            {normalized.rows} rows x {normalized.cols} cols
          </p>
        </div>

        <div className="overflow-x-auto pb-2">
          <div
            className="min-w-max w-full rounded-[1.5rem] border border-[color:var(--line)] bg-[color:var(--line)] p-px"
          >
            <div
              className="grid gap-px"
              data-testid="quote-grid"
              style={{
                gridTemplateColumns: buildResponsiveGridTemplateColumns(normalized.cols),
              }}
            >
              {normalized.grid.map((cell) => {
                if (cell.isBlock || typeof cell.number !== "number") {
                  return (
                    <div
                      key={`block-${cell.index}`}
                      aria-hidden="true"
                      className="h-[var(--board-grid-row-height)] bg-[#2f3136]"
                    />
                  );
                }

                const cellNumber = cell.number;
                const isActive = cellNumber === activeNumber;
                const isInActiveClue = activeNumbers.includes(cellNumber);
                const isRemoteActive = remotePresence?.activeNumber === cellNumber;
                const isRemoteClue = remotePresence?.activeClueId === cell.clueLabel;
                const isRemoteFlash = remoteFlashNumberSet.has(cellNumber);

                return (
                  <label
                    key={`grid-${cellNumber}`}
                    className={cx(
                      "relative flex h-[var(--board-grid-row-height)] items-stretch overflow-hidden transition-colors",
                      isActive
                        ? "bg-[color:var(--accent)]"
                        : isRemoteActive
                          ? "bg-[color:var(--remote-soft)]"
                          : isInActiveClue
                            ? "bg-[color:var(--accent-soft)]"
                            : isRemoteClue
                              ? "bg-[color:var(--remote-soft)]"
                              : "bg-[color:var(--panel-strong)]",
                      isRemoteFlash && "ring-2 ring-inset ring-[color:var(--remote-accent)]",
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
                      className="h-full w-full bg-transparent px-1 pt-3.5 text-center text-[1.2rem] font-semibold uppercase text-[color:var(--foreground)] outline-none disabled:cursor-not-allowed disabled:text-[color:var(--muted)]"
                      disabled={isReadOnly}
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
        </div>
      </section>

      <section className="rounded-[2rem] border border-[color:var(--line)] bg-[color:var(--panel)] p-3 shadow-[0_18px_40px_-30px_rgba(60,36,18,0.4)] md:p-4">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
          Author and title
        </p>
        <div className="mt-3 overflow-x-auto pb-2">
          <div
            className="min-w-max w-full rounded-[1.2rem] border border-[color:var(--line)] bg-[color:var(--line)] p-px"
          >
            <div
              className="grid gap-px"
              data-testid="title-grid"
              style={{
                gridTemplateColumns: buildResponsiveGridTemplateColumns(titleCellCount),
              }}
            >
              {normalized.titleCells.map((cell) => {
                const isActive = cell.clueId === activeClue.id;
                const isRemoteActive = remotePresence?.activeClueId === cell.clueId;

                return (
                  <button
                    key={`title-${cell.sourceNumber}`}
                    className={cx(
                      "relative flex h-[var(--board-title-row-height)] items-center justify-center text-center transition-colors disabled:cursor-not-allowed",
                      isActive
                        ? "bg-[color:var(--accent)]"
                        : isRemoteActive
                          ? "bg-[color:var(--remote-soft)]"
                          : "bg-[color:var(--panel-strong)]",
                    )}
                    disabled={isReadOnly}
                    onClick={() => {
                      setActiveClue(cell.clueId, "clue", cell.sourceNumber);
                    }}
                    type="button"
                  >
                    <span className="absolute left-1.5 top-1 text-[0.68rem] font-semibold text-[color:var(--muted)]">
                      {cell.label}
                    </span>
                    <span className="text-lg font-semibold uppercase text-[color:var(--foreground)]">
                      {entriesByNumber[cell.sourceNumber] ?? ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm italic text-[color:var(--muted)]">
          Author and title from the first letter of each answer.
        </p>
      </section>

      <section className="rounded-[2rem] border border-[color:var(--line)] bg-[color:var(--panel)] p-[var(--surface-padding)] shadow-[0_18px_40px_-30px_rgba(60,36,18,0.4)] md:p-[var(--surface-padding-lg)]">
        <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--accent-ink)] md:text-xl">
          Click any clue or number below to go directly to that location
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {normalized.clues.map((clue) => {
            const isActive = clue.id === activeClue.id;
            const isRemoteActive = remotePresence?.activeClueId === clue.id;

            return (
              <button
                key={clue.id}
                className={cx(
                  "flex items-start gap-2.5 rounded-[1.25rem] border px-3.5 py-2.5 text-left transition-all disabled:cursor-not-allowed",
                  isActive
                    ? "border-[color:var(--accent-ink)] bg-[color:var(--accent-soft)]"
                    : isRemoteActive
                      ? "border-[color:var(--remote-accent)] bg-[color:var(--remote-soft)]"
                      : "border-transparent bg-transparent hover:border-[color:var(--line)] hover:bg-[color:var(--panel-strong)]",
                )}
                disabled={isReadOnly}
                onClick={() => {
                  setActiveClue(clue.id, "clue");
                }}
                type="button"
              >
                <span
                  className={cx(
                    "min-w-6 text-lg font-semibold",
                    isRemoteActive
                      ? "text-[color:var(--remote-ink)]"
                      : "text-[color:var(--accent-ink)]",
                  )}
                >
                  {clue.label}.
                </span>
                <span className="text-[0.98rem] leading-6 text-[color:var(--foreground)]">
                  {clue.text}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
