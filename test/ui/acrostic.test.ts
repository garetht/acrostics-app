import { describe, expect, it } from "vitest";

import { normalizePuzzle } from "@/app/acrostic";
import { makePuzzle } from "./helpers/puzzle";

describe("normalizePuzzle", () => {
  it("decodes html entities in clues and quote metadata", () => {
    const normalized = normalizePuzzle(
      makePuzzle({
        clueData: ["1", "2"],
        clues: ["Rock &amp; Roll", "Best &hellip; thing"],
        gridLetters: "AB",
        gridNumbers: [1, 2, 0, 0],
        mapTitle: [1, 2],
        quote: "Tom &amp; Jerry",
        rows: 2,
        cols: 2,
      }),
    );

    expect(normalized.meta.quote).toBe("Tom & Jerry");
    expect(normalized.clues.map((clue) => clue.text)).toEqual([
      "Rock & Roll",
      "Best … thing",
    ]);
  });

  it("builds clue lookups and grid ordering from the puzzle payload", () => {
    const normalized = normalizePuzzle(makePuzzle());

    expect(normalized.lookup.clueIdByNumber[1]).toBe("A");
    expect(normalized.lookup.clueIdByNumber[4]).toBe("B");
    expect(normalized.lookup.gridIndexByNumber[6]).toBe(5);
    expect(normalized.lookup.gridNumbersInOrder.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(normalized.grid[0]).toMatchObject({
      clueLabel: "A",
      isBlock: false,
      number: 1,
    });
    expect(normalized.grid[14]).toMatchObject({
      clueLabel: "O",
      number: 15,
    });
  });

  it("falls back to derived clue labels when grid labels are missing", () => {
    const normalized = normalizePuzzle(
      makePuzzle({
        gridLetters: "",
      }),
    );

    expect(normalized.grid[0]?.clueLabel).toBe("A");
    expect(normalized.grid[3]?.clueLabel).toBe("B");
    expect(normalized.grid[6]?.clueLabel).toBeNull();
  });

  it("falls back to the first clue numbers when mapTitle is missing or invalid", () => {
    const missingTitle = normalizePuzzle(
      makePuzzle({
        mapTitle: [],
      }),
    );
    const partiallyInvalidTitle = normalizePuzzle(
      makePuzzle({
        mapTitle: [999, 5],
      }),
    );

    expect(missingTitle.titleCells.map((cell) => cell.sourceNumber)).toEqual([1, 4]);
    expect(partiallyInvalidTitle.titleCells.map((cell) => cell.sourceNumber)).toEqual([
      1,
      5,
    ]);
  });
});
