"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { readDateSearchParam } from "@/lib/acrostics-archive";
import { AcrosticsArchiveScreen } from "./acrostics-archive-screen";
import { RouteStatusScreen } from "./route-status-screen";
import { useAcrosticSelection } from "./use-acrostic-selection";

export function AcrosticsArchiveRoute() {
  const searchParams = useSearchParams();
  const [retryKey, setRetryKey] = useState(0);
  const requestedDate = readDateSearchParam(searchParams.getAll("date"));
  const selection = useAcrosticSelection(requestedDate, retryKey);

  if (selection.status === "loading") {
    return (
      <RouteStatusScreen
        body="Loading the archived acrostics and your selected puzzle."
        eyebrow="Archive"
        title="Loading acrostics"
      />
    );
  }

  if (selection.status === "error") {
    return (
      <RouteStatusScreen
        actionLabel="Retry"
        body={selection.message}
        eyebrow="Archive"
        onAction={() => {
          setRetryKey((current) => current + 1);
        }}
        title="Archive unavailable"
      />
    );
  }

  return (
    <AcrosticsArchiveScreen
      availableDates={selection.availableDates}
      cellCountByDate={selection.cellCountByDate}
      latestDate={selection.latestDate}
      puzzle={selection.puzzle}
      selectedDate={selection.selectedDate}
    />
  );
}
