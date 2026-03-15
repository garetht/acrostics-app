"use client";

import Link from "next/link";

type RouteStatusScreenProps = {
  actionLabel?: string;
  actionHref?: string;
  body: string;
  eyebrow: string;
  onAction?: () => void;
  title: string;
};

export function RouteStatusScreen({
  actionHref,
  actionLabel,
  body,
  eyebrow,
  onAction,
  title,
}: RouteStatusScreenProps) {
  return (
    <div className="min-h-screen px-[var(--page-shell-inline-padding)] py-[var(--page-shell-block-padding)]">
      <main
        className="mx-auto flex w-full max-w-[920px] flex-col gap-[var(--page-shell-gap)]"
        data-testid="route-status-layout"
      >
        <section className="rounded-[2rem] border border-[color:var(--line)] bg-[color:var(--panel)] p-[var(--surface-padding)] shadow-[0_24px_70px_-40px_rgba(60,36,18,0.45)] md:p-[var(--surface-padding-lg)]">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[color:var(--muted)]">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)] md:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[color:var(--muted)]">
            {body}
          </p>

          {actionLabel ? (
            <div className="mt-6">
              {actionHref ? (
                <Link
                  className="inline-flex rounded-full border border-[color:var(--accent-ink)] bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--foreground)] transition hover:bg-[#e4b53a]"
                  href={actionHref}
                >
                  {actionLabel}
                </Link>
              ) : (
                <button
                  className="rounded-full border border-[color:var(--accent-ink)] bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--foreground)] transition hover:bg-[#e4b53a]"
                  onClick={onAction}
                  type="button"
                >
                  {actionLabel}
                </button>
              )}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
