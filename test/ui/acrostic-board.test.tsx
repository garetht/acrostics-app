import { useState, type ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AcrosticBoard,
  type AcrosticEditorPatch,
} from "@/app/acrostic-board";
import type { XWordInfoPuzzle } from "@/app/acrostic";
import { flushTimers } from "./helpers/browser";
import { makePuzzle } from "./helpers/puzzle";

function applyChanges(
  current: Record<number, string>,
  changes: AcrosticEditorPatch[],
) {
  const next = { ...current };

  for (const change of changes) {
    if (!Number.isInteger(change.number) || change.number <= 0) {
      continue;
    }

    if (!change.value) {
      delete next[change.number];
      continue;
    }

    next[change.number] = change.value;
  }

  return next;
}

function ControlledBoard({
  initialEntries = {},
  onProgressChange,
  puzzle = makePuzzle(),
  remoteFlashNumbers,
  remotePresence,
  isReadOnly,
}: {
  initialEntries?: Record<number, string>;
  isReadOnly?: boolean;
  onProgressChange?: (filledCount: number) => void;
  puzzle?: XWordInfoPuzzle;
  remoteFlashNumbers?: readonly number[];
  remotePresence?: ComponentProps<typeof AcrosticBoard>["remotePresence"];
}) {
  const [entriesByNumber, setEntriesByNumber] = useState(initialEntries);

  return (
    <AcrosticBoard
      entriesByNumber={entriesByNumber}
      isReadOnly={isReadOnly}
      onEntriesPatch={(changes) => {
        setEntriesByNumber((current) => applyChanges(current, changes));
      }}
      onProgressChange={onProgressChange}
      puzzle={puzzle}
      remoteFlashNumbers={remoteFlashNumbers}
      remotePresence={remotePresence}
    />
  );
}

describe("AcrosticBoard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("focuses the first clue cell on mount", async () => {
    render(<ControlledBoard />);

    await flushTimers();

    expect(screen.getByLabelText("Clue A cell 1")).toHaveFocus();
  });

  it("uppercases typed letters and strips non-letter input", () => {
    render(<ControlledBoard />);

    const clueCell = screen.getByLabelText("Clue A cell 1");

    fireEvent.change(clueCell, {
      target: { value: "1!" },
    });
    expect(clueCell).toHaveValue("");

    fireEvent.change(clueCell, {
      target: { value: "b" },
    });
    expect(clueCell).toHaveValue("B");
  });

  it("fans paste across the active clue sequence and advances focus", async () => {
    render(<ControlledBoard />);

    fireEvent.paste(screen.getByLabelText("Clue A cell 1"), {
      clipboardData: {
        getData: () => "ab!",
      },
    });

    await flushTimers();

    expect(screen.getByLabelText("Clue A cell 1")).toHaveValue("A");
    expect(screen.getByLabelText("Clue A cell 2")).toHaveValue("B");
    expect(screen.getByLabelText("Clue A cell 3")).toHaveFocus();
  });

  it("clears filled cells and moves backward on backspace", async () => {
    render(<ControlledBoard initialEntries={{ 1: "A", 2: "B" }} />);

    const secondCell = screen.getByLabelText("Clue A cell 2");
    secondCell.focus();
    await flushTimers();

    fireEvent.keyDown(secondCell, { key: "Backspace" });
    await flushTimers();

    expect(secondCell).toHaveValue("");
    expect(screen.getByLabelText("Clue A cell 1")).toHaveFocus();
  });

  it("moves backward on backspace when the current cell is already empty", async () => {
    render(<ControlledBoard initialEntries={{ 1: "A" }} />);

    const secondCell = screen.getByLabelText("Clue A cell 2");
    secondCell.focus();
    await flushTimers();

    fireEvent.keyDown(secondCell, { key: "Backspace" });
    await flushTimers();

    expect(screen.getByLabelText("Clue A cell 1")).toHaveFocus();
    expect(screen.getByLabelText("Clue A cell 1")).toHaveValue("A");
  });

  it("supports arrow-key navigation, including vertical movement in the quote grid", async () => {
    render(<ControlledBoard />);

    const firstClueCell = screen.getByLabelText("Clue A cell 1");
    firstClueCell.focus();
    fireEvent.keyDown(firstClueCell, { key: "ArrowRight" });
    await flushTimers();
    expect(screen.getByLabelText("Clue A cell 2")).toHaveFocus();

    const firstGridCell = screen.getByLabelText("Quote grid cell 1");
    firstGridCell.focus();
    fireEvent.keyDown(firstGridCell, { key: "ArrowDown" });
    await flushTimers();
    expect(screen.getByLabelText("Quote grid cell 6")).toHaveFocus();
  });

  it("disables the editor in read-only mode", () => {
    render(<ControlledBoard isReadOnly />);

    expect(screen.getByText("Waiting for host")).toBeInTheDocument();
    expect(screen.getByLabelText("Clue A cell 1")).toBeDisabled();
    expect(screen.getByRole("button", { name: /First clue/ })).toBeDisabled();
  });

  it("reports progress changes as entries are filled", () => {
    const onProgressChange = vi.fn();

    render(<ControlledBoard onProgressChange={onProgressChange} />);

    fireEvent.paste(screen.getByLabelText("Clue A cell 1"), {
      clipboardData: {
        getData: () => "ab",
      },
    });

    expect(onProgressChange).toHaveBeenCalledWith(0);
    expect(onProgressChange).toHaveBeenLastCalledWith(2);
  });

  it("uses the compact shared sizing for the clue chips and board grids", () => {
    render(<ControlledBoard />);

    expect(screen.getByLabelText("Clue A cell 1").closest("label")).toHaveClass(
      "h-[var(--board-clue-chip-height)]",
      "w-[var(--board-clue-chip-width)]",
    );
    expect(screen.getByTestId("quote-grid").style.gridTemplateColumns).toBe(
      "repeat(5, minmax(var(--board-grid-cell-size), var(--board-grid-cell-size)))",
    );
    expect(screen.getByTestId("title-grid").style.gridTemplateColumns).toBe(
      "repeat(2, minmax(var(--board-grid-cell-size), var(--board-grid-cell-size)))",
    );
  });

  it("renders remote presence copy and flashes remote cells", () => {
    render(
      <ControlledBoard
        remoteFlashNumbers={[2]}
        remotePresence={{
          activeClueId: "A",
          activeNumber: 2,
          displayName: "Guest",
          isTyping: true,
          surface: "clue",
        }}
      />,
    );

    expect(screen.getByText("Guest editing clue A / cell 2...")).toBeInTheDocument();
    expect(screen.getByLabelText("Clue A cell 2").closest("label")).toHaveClass("ring-2");
  });
});
