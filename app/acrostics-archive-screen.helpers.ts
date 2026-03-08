export function formatArchiveDate(date: string) {
  const [yearText, monthText, dayText] = date.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function buildArchiveSections(availableDates: readonly string[]) {
  const sections: Array<{ dates: string[]; year: string }> = [];

  for (const date of [...availableDates].reverse()) {
    const year = date.slice(0, 4);
    const currentSection = sections.at(-1);

    if (!currentSection || currentSection.year !== year) {
      sections.push({ dates: [date], year });
      continue;
    }

    currentSection.dates.push(date);
  }

  return sections;
}
