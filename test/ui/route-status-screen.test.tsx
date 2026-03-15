import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RouteStatusScreen } from "@/app/route-status-screen";

describe("RouteStatusScreen", () => {
  it("uses the compact shared shell spacing", () => {
    render(
      <RouteStatusScreen
        body="Waiting for the selected puzzle."
        eyebrow="Archive"
        title="Loading acrostics"
      />,
    );

    expect(screen.getByTestId("route-status-layout")).toHaveClass(
      "gap-[var(--page-shell-gap)]",
    );
    expect(screen.getByText("Loading acrostics").closest("section")).toHaveClass(
      "p-[var(--surface-padding)]",
      "md:p-[var(--surface-padding-lg)]",
    );
  });
});
