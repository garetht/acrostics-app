import puzzleFixture from "../../fixtures/xwordinfo-puzzle.decoded.json";

import type { XWordInfoPuzzle } from "@/app/acrostic";

export function makePuzzle(
  overrides: Partial<XWordInfoPuzzle> = {},
): XWordInfoPuzzle {
  return {
    ...structuredClone(puzzleFixture),
    ...overrides,
    clueData: overrides.clueData
      ? [...overrides.clueData]
      : [...puzzleFixture.clueData],
    clues: overrides.clues ? [...overrides.clues] : [...puzzleFixture.clues],
    gridNumbers: overrides.gridNumbers
      ? [...overrides.gridNumbers]
      : [...puzzleFixture.gridNumbers],
    mapTitle: overrides.mapTitle
      ? [...overrides.mapTitle]
      : [...puzzleFixture.mapTitle],
  };
}
