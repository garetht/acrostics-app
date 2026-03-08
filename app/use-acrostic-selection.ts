"use client";

import { useEffect, useState } from "react";

import {
  fetchAcrosticArchiveManifest,
  fetchAcrosticPuzzleByDate,
  resolveAcrosticArchiveSelection,
  type ResolvedAcrosticArchiveSelection,
} from "@/lib/acrostics-archive";
import type { SavedAcrosticPuzzle } from "@/lib/acrostics-data";

export type AcrosticSelectionState =
  | {
      status: "loading";
    }
  | {
      message: string;
      status: "error";
    }
  | ({
      puzzle: SavedAcrosticPuzzle;
      status: "ready";
    } & ResolvedAcrosticArchiveSelection);

type InternalAcrosticSelectionState =
  | {
      requestKey: string;
      status: "loading";
    }
  | {
      message: string;
      requestKey: string;
      status: "error";
    }
  | ({
      puzzle: SavedAcrosticPuzzle;
      requestKey: string;
      status: "ready";
    } & ResolvedAcrosticArchiveSelection);

export function useAcrosticSelection(
  requestedDate: string | null,
  retryKey = 0,
): AcrosticSelectionState {
  const requestKey = `${requestedDate ?? "latest"}:${retryKey}`;
  const [state, setState] = useState<InternalAcrosticSelectionState>({
    requestKey: "",
    status: "loading",
  });

  useEffect(() => {
    const abortController = new AbortController();

    void (async () => {
      try {
        const manifest = await fetchAcrosticArchiveManifest({
          signal: abortController.signal,
        });
        const selection = resolveAcrosticArchiveSelection(requestedDate, manifest);
        const puzzle = await fetchAcrosticPuzzleByDate(selection.selectedDate, {
          signal: abortController.signal,
        });

        if (abortController.signal.aborted) {
          return;
        }

        setState({
          ...selection,
          puzzle,
          requestKey,
          status: "ready",
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setState({
          message: getErrorMessage(error),
          requestKey,
          status: "error",
        });
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [requestKey, requestedDate]);

  if (state.requestKey !== requestKey || state.status === "loading") {
    return { status: "loading" };
  }

  if (state.status === "error") {
    return {
      message: state.message,
      status: "error",
    };
  }

  return {
    availableDates: state.availableDates,
    cellCountByDate: state.cellCountByDate,
    latestDate: state.latestDate,
    puzzle: state.puzzle,
    selectedDate: state.selectedDate,
    status: "ready",
  };
}

function getErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "Unable to load the acrostic archive.";
}
