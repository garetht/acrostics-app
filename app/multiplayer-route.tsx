"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  readDateSearchParam,
  readSessionSearchParam,
} from "@/lib/acrostics-archive";
import { MultiplayerScreen } from "./multiplayer-screen";
import { RouteStatusScreen } from "./route-status-screen";
import { useAcrosticSelection } from "./use-acrostic-selection";

export function MultiplayerRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [retryKey, setRetryKey] = useState(0);
  const requestedDate = readDateSearchParam(searchParams.getAll("date"));
  const sessionId = readSessionSearchParam(searchParams.getAll("session"));
  const selection = useAcrosticSelection(requestedDate, retryKey);
  const resolvedSelectedDate =
    selection.status === "ready" ? selection.selectedDate : null;

  useEffect(() => {
    if (!resolvedSelectedDate || sessionId) {
      return;
    }

    router.replace(`/?date=${encodeURIComponent(resolvedSelectedDate)}`);
  }, [resolvedSelectedDate, router, sessionId]);

  if (selection.status === "loading") {
    return (
      <RouteStatusScreen
        body="Loading the selected puzzle and preparing the multiplayer session."
        eyebrow="Multiplayer"
        title="Loading session"
      />
    );
  }

  if (selection.status === "error") {
    return (
      <RouteStatusScreen
        actionLabel="Retry"
        body={selection.message}
        eyebrow="Multiplayer"
        onAction={() => {
          setRetryKey((current) => current + 1);
        }}
        title="Session unavailable"
      />
    );
  }

  if (!sessionId) {
    return (
      <RouteStatusScreen
        actionHref={`/?date=${encodeURIComponent(selection.selectedDate)}`}
        actionLabel="Back to archive"
        body="This multiplayer link is missing a session id. Redirecting you back to the archive."
        eyebrow="Multiplayer"
        title="Missing session link"
      />
    );
  }

  return (
    <MultiplayerScreen
      puzzle={selection.puzzle}
      selectedDate={selection.selectedDate}
      sessionId={sessionId}
    />
  );
}
