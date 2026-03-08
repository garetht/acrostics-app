import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadStoredAcrosticProgress,
  type StorageLike,
} from "@/lib/acrostics-progress";
import { flushTimers } from "./helpers/browser";
import { makePuzzle } from "./helpers/puzzle";
import { seedProgressStorage } from "./helpers/storage";

import type { AcrosticBoardProps } from "@/app/acrostic-board";

const boardState = vi.hoisted(() => ({
  props: null as AcrosticBoardProps | null,
}));

vi.mock("@/app/acrostic-board", () => ({
  AcrosticBoard: (props: AcrosticBoardProps) => {
    boardState.props = props;
    return <div data-testid="board-proxy" />;
  },
}));

vi.mock("@/app/start-multiplayer-button", () => ({
  StartMultiplayerButton: () => <div data-testid="start-multiplayer-button" />,
}));

import { AcrosticPuzzleScreen } from "@/app/acrostic-puzzle-screen";

describe("AcrosticPuzzleScreen", () => {
  beforeEach(() => {
    boardState.props = null;
    vi.useFakeTimers();
  });

  it("hydrates entries from local storage once without immediately persisting", async () => {
    seedProgressStorage({
      "2026-03-08": {
        entriesByNumber: {
          "1": "A",
          "2": "B",
        },
        updatedAt: "2026-03-08T12:00:00.000Z",
      },
    });
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    render(
      <AcrosticPuzzleScreen
        puzzle={makePuzzle()}
        storageDate="2026-03-08"
      />,
    );

    expect(boardState.props?.entriesByNumber).toEqual({});

    await flushTimers();

    expect(getItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(boardState.props?.entriesByNumber).toEqual({
      1: "A",
      2: "B",
    });
  });

  it("persists later edits for the selected date and ignores invalid patch numbers", async () => {
    render(
      <AcrosticPuzzleScreen
        puzzle={makePuzzle()}
        storageDate="2026-03-08"
      />,
    );

    await flushTimers();

    act(() => {
      boardState.props?.onEntriesPatch([
        { number: 0, value: "Z" },
        { number: 2, value: "c" },
        { number: -4, value: "Q" },
      ]);
    });

    expect(loadStoredAcrosticProgress(window.localStorage as StorageLike)).toEqual({
      "2026-03-08": {
        entriesByNumber: {
          "2": "C",
        },
        updatedAt: expect.any(String),
      },
    });
  });

  it("forwards progress updates from the board", async () => {
    const onProgressChange = vi.fn();

    render(
      <AcrosticPuzzleScreen
        onProgressChange={onProgressChange}
        puzzle={makePuzzle()}
        storageDate="2026-03-08"
      />,
    );

    await flushTimers();

    act(() => {
      boardState.props?.onProgressChange?.(7);
    });

    expect(onProgressChange).toHaveBeenCalledWith(7);
  });
});
