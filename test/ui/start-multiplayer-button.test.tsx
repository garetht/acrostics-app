import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StartMultiplayerButton } from "@/app/start-multiplayer-button";
import {
  loadStoredAcrosticProgress,
  type StorageLike,
} from "@/lib/acrostics-progress";
import {
  loadStoredMultiplayerSessions,
} from "@/lib/acrostics-multiplayer";
import { seedProgressStorage } from "./helpers/storage";
import { routerMock } from "./mocks/next-navigation";

describe("StartMultiplayerButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts a blank multiplayer session and navigates to the room", async () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("session-uuid-0000")
      .mockReturnValueOnce("client-uuid-0000");

    render(
      <StartMultiplayerButton
        date="2026-03-08"
        validNumbers={[1, 2, 3]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start multiplayer" }));

    expect(routerMock.push).toHaveBeenCalledWith(
      "/multiplayer?date=2026-03-08&session=acr_20260308_sessionuuid0000",
    );
    expect(loadStoredMultiplayerSessions(window.localStorage)).toMatchObject({
      acr_20260308_sessionuuid0000: {
        clientId: "client-uuid-0000",
        date: "2026-03-08",
        role: "host",
      },
    });
  });

  it("shows the in-progress warning and cancels without launching a session", async () => {
    seedProgressStorage({
      "2026-03-08": {
        entriesByNumber: {
          "1": "A",
        },
        updatedAt: "2026-03-08T12:00:00.000Z",
      },
    });

    render(
      <StartMultiplayerButton
        date="2026-03-08"
        validNumbers={[1, 2, 3]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start multiplayer" }));

    expect(screen.getByText("Solo puzzle in progress")).toBeInTheDocument();
    expect(
      screen.getByText("Start multiplayer from a fresh board?"),
    ).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText("Start multiplayer from a fresh board?"),
    ).not.toBeInTheDocument();
  });

  it("shows the completed warning and can start fresh without mutating solo progress", async () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("session-uuid-1111")
      .mockReturnValueOnce("client-uuid-1111");

    seedProgressStorage({
      "2026-03-08": {
        entriesByNumber: {
          "1": "A",
          "2": "B",
          "3": "C",
        },
        updatedAt: "2026-03-08T12:00:00.000Z",
      },
    });

    render(
      <StartMultiplayerButton
        date="2026-03-08"
        validNumbers={[1, 2, 3]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start multiplayer" }));

    expect(screen.getByText("Completed solo puzzle")).toBeInTheDocument();
    expect(
      screen.getByText("Start a fresh multiplayer board?"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start fresh multiplayer" }));

    expect(routerMock.push).toHaveBeenCalledWith(
      "/multiplayer?date=2026-03-08&session=acr_20260308_sessionuuid1111",
    );
    expect(loadStoredAcrosticProgress(window.localStorage as StorageLike)).toEqual({
      "2026-03-08": {
        entriesByNumber: {
          "1": "A",
          "2": "B",
          "3": "C",
        },
        updatedAt: "2026-03-08T12:00:00.000Z",
      },
    });
  });
});
