import { redirect } from "next/navigation";

import { getBundledAcrosticSelection, readDateSearchParam } from "@/lib/acrostics-archive";
import { MultiplayerScreen } from "../multiplayer-screen";

type SearchParams = Record<string, string | string[] | undefined>;

type MultiplayerPageProps = {
  searchParams?: Promise<SearchParams>;
};

function readSessionSearchParam(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (typeof candidate !== "string") {
    return null;
  }

  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default async function MultiplayerPage({
  searchParams,
}: MultiplayerPageProps) {
  const resolvedSearchParams = ((await searchParams) ?? {}) as SearchParams;
  const requestedDate = readDateSearchParam(resolvedSearchParams.date);
  const sessionId = readSessionSearchParam(resolvedSearchParams.session);
  const { puzzle, selectedDate } = getBundledAcrosticSelection(requestedDate);

  if (!sessionId) {
    redirect(`/?date=${selectedDate}`);
  }

  return (
    <MultiplayerScreen
      puzzle={puzzle}
      selectedDate={selectedDate}
      sessionId={sessionId}
    />
  );
}
