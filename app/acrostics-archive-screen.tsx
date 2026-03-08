"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  countStoredProgressEntries,
  deriveAcrosticProgressStatus,
  loadStoredAcrosticProgress,
} from "@/lib/acrostics-progress";
import type { XWordInfoPuzzle } from "./acrostic";
import { AcrosticPuzzleScreen } from "./acrostic-puzzle-screen";
import {
  buildArchiveSections,
  formatArchiveDate,
} from "./acrostics-archive-screen.helpers";

export type AcrosticsArchiveScreenProps = {
  availableDates: readonly string[];
  cellCountByDate: Readonly<Record<string, number>>;
  latestDate: string;
  puzzle: XWordInfoPuzzle;
  selectedDate: string;
};

function getProgressBadgeClass(kind: "not_started" | "in_progress" | "completed") {
  if (kind === "completed") {
    return "border-[color:rgba(68,103,62,0.25)] bg-[color:rgba(128,171,111,0.22)] text-[#355129]";
  }

  if (kind === "in_progress") {
    return "border-[color:rgba(124,71,17,0.18)] bg-[color:rgba(239,196,71,0.22)] text-[color:var(--accent-ink)]";
  }

  return "border-[color:rgba(112,90,71,0.12)] bg-[color:rgba(112,90,71,0.08)] text-[color:var(--muted)]";
}

export function AcrosticsArchiveScreen({
  availableDates,
  cellCountByDate,
  latestDate,
  puzzle,
  selectedDate,
}: AcrosticsArchiveScreenProps) {
  const selectedDateRef = useRef<HTMLAnchorElement | null>(null);
  const [filledCountByDate, setFilledCountByDate] = useState<Record<string, number>>({});
  const [hasHydratedProgress, setHasHydratedProgress] = useState(false);

  const archiveSections = buildArchiveSections(availableDates);

  useEffect(() => {
    selectedDateRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedDate]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const progressMap = loadStoredAcrosticProgress(window.localStorage);
    const nextFilledCountByDate = Object.fromEntries(
      availableDates.map((date) => [
        date,
        countStoredProgressEntries(progressMap[date]),
      ]),
    ) as Record<string, number>;

    const hydrateFrame = window.requestAnimationFrame(() => {
      setFilledCountByDate(nextFilledCountByDate);
      setHasHydratedProgress(true);
    });

    return () => {
      window.cancelAnimationFrame(hydrateFrame);
    };
  }, [availableDates]);

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <main className="mx-auto grid w-full max-w-[1540px] gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <section className="overflow-hidden rounded-[2rem] border border-[color:var(--line)] bg-[color:var(--panel)] shadow-[0_24px_70px_-40px_rgba(60,36,18,0.45)]">
            <header className="border-b border-[color:rgba(112,90,71,0.14)] px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[color:var(--muted)]">
                Archive
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                Browse by date
              </h1>
              <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
                {availableDates.length} bundled acrostics. The latest available date is{" "}
                <span className="font-semibold text-[color:var(--foreground)]">
                  {latestDate}
                </span>
                .
              </p>
            </header>

            <div className="max-h-[68vh] overflow-y-auto px-3 py-3">
              {archiveSections.map((section) => (
                <section key={section.year} className="pb-4 last:pb-0">
                  <div className="sticky top-0 z-10 mx-2 rounded-full bg-[color:rgba(248,243,234,0.94)] px-3 py-2 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--muted)]">
                      {section.year}
                    </p>
                  </div>

                  <div className="mt-2 flex flex-col gap-2">
                    {section.dates.map((date) => {
                      const isSelected = date === selectedDate;
                      const totalCount = cellCountByDate[date] ?? 0;
                      const filledCount = filledCountByDate[date] ?? 0;
                      const progressStatus =
                        !hasHydratedProgress
                          ? null
                          : deriveAcrosticProgressStatus(filledCount, totalCount);

                      return (
                        <Link
                          key={date}
                          aria-current={isSelected ? "page" : undefined}
                          ref={isSelected ? selectedDateRef : undefined}
                          className={[
                            "group mx-1 rounded-[1.35rem] border px-4 py-3 transition-all",
                            isSelected
                              ? "border-[color:var(--accent-ink)] bg-[color:var(--accent-soft)] shadow-[0_18px_36px_-28px_rgba(124,71,17,0.55)]"
                              : "border-transparent bg-transparent hover:border-[color:rgba(112,90,71,0.18)] hover:bg-[color:var(--panel-strong)]",
                          ].join(" ")}
                          href={`/?date=${date}`}
                          prefetch={false}
                          scroll={false}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--foreground)]">
                                {formatArchiveDate(date)}
                              </p>
                              <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">
                                {date}
                              </p>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              {date === latestDate ? (
                                <span className="rounded-full border border-[color:rgba(124,71,17,0.16)] bg-[color:rgba(239,196,71,0.18)] px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--accent-ink)]">
                                  Latest
                                </span>
                              ) : null}

                              {progressStatus ? (
                                <span
                                  className={[
                                    "rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.14em]",
                                    getProgressBadgeClass(progressStatus.kind),
                                  ].join(" ")}
                                >
                                  {progressStatus.kind === "in_progress"
                                    ? progressStatus.detail
                                    : progressStatus.label}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </aside>

        <section className="min-w-0">
          <AcrosticPuzzleScreen
            key={selectedDate}
            onProgressChange={(filledCount) => {
              setFilledCountByDate((current) => {
                if (current[selectedDate] === filledCount) {
                  return current;
                }

                return {
                  ...current,
                  [selectedDate]: filledCount,
                };
              });
            }}
            puzzle={puzzle}
            storageDate={selectedDate}
          />
        </section>
      </main>
    </div>
  );
}
