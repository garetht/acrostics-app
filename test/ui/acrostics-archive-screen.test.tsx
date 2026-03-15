import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { flushTimers } from "./helpers/browser";
import { makePuzzle } from "./helpers/puzzle";
import { seedProgressStorage } from "./helpers/storage";

import type { AcrosticPuzzleScreenProps } from "@/app/acrostic-puzzle-screen";

const archiveState = vi.hoisted(() => ({
  props: null as AcrosticPuzzleScreenProps | null,
}));

vi.mock("@/app/acrostic-puzzle-screen", () => ({
  AcrosticPuzzleScreen: (props: AcrosticPuzzleScreenProps) => {
    archiveState.props = props;
    return (
      <button
        onClick={() => {
          props.onProgressChange?.(2);
        }}
        type="button"
      >
        Mock puzzle screen
      </button>
    );
  },
}));

import { AcrosticsArchiveScreen } from "@/app/acrostics-archive-screen";

describe("AcrosticsArchiveScreen", () => {
  beforeEach(() => {
    archiveState.props = null;
    vi.useFakeTimers();
  });

  it("groups archive dates by year, highlights the selection, and scrolls it into view", async () => {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, "scrollIntoView");

    render(
      <AcrosticsArchiveScreen
        availableDates={["2025-12-28", "2026-01-11", "2026-01-25"]}
        cellCountByDate={{
          "2025-12-28": 2,
          "2026-01-11": 3,
          "2026-01-25": 3,
        }}
        latestDate="2026-01-25"
        puzzle={makePuzzle()}
        selectedDate="2026-01-11"
      />,
    );

    await flushTimers();

    expect(screen.getAllByText(/^(2026|2025)$/).map((node) => node.textContent)).toEqual([
      "2026",
      "2025",
    ]);
    expect(screen.getByRole("link", { name: /2026-01-11/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Latest")).toBeInTheDocument();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it("hydrates progress badges after the animation frame", async () => {
    seedProgressStorage({
      "2025-12-28": {
        entriesByNumber: {
          "1": "A",
          "2": "B",
        },
        updatedAt: "2026-03-08T12:00:00.000Z",
      },
      "2026-01-11": {
        entriesByNumber: {
          "1": "A",
        },
        updatedAt: "2026-03-08T12:00:00.000Z",
      },
    });

    render(
      <AcrosticsArchiveScreen
        availableDates={["2025-12-28", "2026-01-11", "2026-01-25"]}
        cellCountByDate={{
          "2025-12-28": 2,
          "2026-01-11": 3,
          "2026-01-25": 3,
        }}
        latestDate="2026-01-25"
        puzzle={makePuzzle()}
        selectedDate="2026-01-11"
      />,
    );

    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
    expect(screen.queryByText("1/3")).not.toBeInTheDocument();

    await flushTimers();

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("updates the selected date badge when the child puzzle reports progress", async () => {
    render(
      <AcrosticsArchiveScreen
        availableDates={["2025-12-28", "2026-01-11", "2026-01-25"]}
        cellCountByDate={{
          "2025-12-28": 2,
          "2026-01-11": 3,
          "2026-01-25": 3,
        }}
        latestDate="2026-01-25"
        puzzle={makePuzzle()}
        selectedDate="2026-01-11"
      />,
    );

    await flushTimers();

    act(() => {
      archiveState.props?.onProgressChange?.(2);
    });

    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("uses the wider compact desktop shell for the archive layout", () => {
    render(
      <AcrosticsArchiveScreen
        availableDates={["2025-12-28"]}
        cellCountByDate={{
          "2025-12-28": 2,
        }}
        latestDate="2025-12-28"
        puzzle={makePuzzle()}
        selectedDate="2025-12-28"
      />,
    );

    expect(screen.getByTestId("archive-layout")).toHaveClass(
      "max-w-[var(--page-shell-max-width)]",
      "gap-[var(--page-shell-gap)]",
      "xl:grid-cols-[var(--archive-rail-width)_minmax(0,1fr)]",
    );
  });
});
