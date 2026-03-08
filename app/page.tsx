import { getBundledAcrosticSelection, readDateSearchParam } from "@/lib/acrostics-archive";
import { AcrosticsArchiveScreen } from "./acrostics-archive-screen";

type SearchParams = Record<string, string | string[] | undefined>;

type HomeProps = {
  searchParams?: Promise<SearchParams>;
};

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = ((await searchParams) ?? {}) as SearchParams;
  const requestedDate = readDateSearchParam(resolvedSearchParams.date);
  const { availableDates, cellCountByDate, latestDate, puzzle, selectedDate } =
    getBundledAcrosticSelection(requestedDate);

  return (
    <AcrosticsArchiveScreen
      availableDates={availableDates}
      cellCountByDate={cellCountByDate}
      latestDate={latestDate}
      puzzle={puzzle}
      selectedDate={selectedDate}
    />
  );
}
