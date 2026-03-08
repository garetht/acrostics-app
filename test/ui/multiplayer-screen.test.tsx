import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AcrosticBoardProps } from "@/app/acrostic-board";
import { MultiplayerScreen } from "@/app/multiplayer-screen";
import {
  createMultiplayerSessionRecord,
  loadStoredMultiplayerSessions,
  type MultiplayerMessage,
} from "@/lib/acrostics-multiplayer";
import { flushTimers } from "./helpers/browser";
import {
  getClipboardWrites,
  getCreatedPeers,
  queueRandomUUIDs,
  rejectNextClipboardWrite,
  resetFakeMultiplayerRuntime,
} from "./helpers/fake-multiplayer-runtime";
import { makePuzzle } from "./helpers/puzzle";
import { seedMultiplayerStorage } from "./helpers/storage";
import { routerMock } from "./mocks/next-navigation";

const boardState = vi.hoisted(() => ({
  props: null as AcrosticBoardProps | null,
}));

vi.mock("@/app/acrostic-board", () => ({
  AcrosticBoard: (props: AcrosticBoardProps) => {
    boardState.props = props;
    return <div data-testid="board-proxy" />;
  },
}));

vi.mock("@/app/multiplayer-runtime", async () => {
  const mod = await import("./helpers/fake-multiplayer-runtime");
  return {
    multiplayerRuntime: mod.fakeMultiplayerRuntime,
  };
});

describe("MultiplayerScreen", () => {
  beforeEach(() => {
    boardState.props = null;
    resetFakeMultiplayerRuntime();
    vi.useFakeTimers();
  });

  it("restores stored host sessions and exposes the invite controls", async () => {
    const sessionRecord = createMultiplayerSessionRecord({
      clientId: "host-client",
      date: "2026-03-08",
      displayName: "Host",
      role: "host",
      sessionId: "host-session",
      updatedAt: "2026-03-08T12:00:00.000Z",
    });

    seedMultiplayerStorage({
      [sessionRecord.sessionId]: sessionRecord,
    });

    render(
      <MultiplayerScreen
        puzzle={makePuzzle()}
        selectedDate="2026-03-08"
        sessionId="host-session"
      />,
    );

    expect(await screen.findByRole("button", { name: "Copy invite link" })).toBeInTheDocument();
    expect(getCreatedPeers()).toHaveLength(1);
    expect(getCreatedPeers()[0]?.id).toBe("host-session");

    act(() => {
      getCreatedPeers()[0]?.emitOpen();
    });

    expect(screen.getByText("Host session is live. Share the invite link to connect a guest.")).toBeInTheDocument();
    expect(boardState.props?.isReadOnly).toBe(false);
  });

  it("keeps guests read-only until connected and applies inbound state and presence updates", async () => {
    queueRandomUUIDs("guest-client");

    render(
      <MultiplayerScreen
        puzzle={makePuzzle()}
        selectedDate="2026-03-08"
        sessionId="guest-session"
      />,
    );

    const peer = getCreatedPeers()[0];

    expect(peer).toBeDefined();
    expect(boardState.props?.isReadOnly).toBe(true);

    act(() => {
      peer?.emitOpen();
    });

    const connection = peer?.outboundConnections[0];
    expect(connection).toBeDefined();

    act(() => {
      connection?.emitOpen();
    });

    expect(connection?.sentMessages[0]).toMatchObject({
      type: "join_request",
      clientId: "guest-client",
      date: "2026-03-08",
      sessionId: "guest-session",
    } satisfies MultiplayerMessage);

    act(() => {
      connection?.emitData({
        type: "join_accept",
        snapshot: {
          cellSessionSeqByNumber: {
            "1": 1,
          },
          date: "2026-03-08",
          entriesByNumber: {
            "1": "A",
          },
          sessionSeq: 1,
        },
        hostDisplayName: "Host",
      } satisfies MultiplayerMessage);
    });

    expect(boardState.props?.entriesByNumber).toEqual({ 1: "A" });
    expect(boardState.props?.isReadOnly).toBe(false);

    act(() => {
      connection?.emitData({
        type: "presence_update",
        presence: {
          activeClueId: "A",
          activeNumber: 1,
          clientId: "host-client",
          displayName: "Host",
          isTyping: true,
          surface: "clue",
        },
      } satisfies MultiplayerMessage);
      connection?.emitData({
        type: "state_patch",
        patch: {
          changedBy: "host-client",
          changes: [
            {
              number: 2,
              sessionSeq: 2,
              value: "B",
            },
          ],
          clientOpId: "patch-1",
        },
      } satisfies MultiplayerMessage);
    });

    expect(boardState.props?.remotePresence).toMatchObject({
      activeNumber: 1,
      displayName: "Host",
      isTyping: true,
    });
    expect(boardState.props?.entriesByNumber).toEqual({ 1: "A", 2: "B" });
    expect(boardState.props?.remoteFlashNumbers).toEqual([2]);

    await flushTimers();
    expect(boardState.props?.remoteFlashNumbers).toEqual([]);
  });

  it("shows a rejection banner and clears stored sessions when the host rejects the guest", () => {
    queueRandomUUIDs("guest-client");

    render(
      <MultiplayerScreen
        puzzle={makePuzzle()}
        selectedDate="2026-03-08"
        sessionId="guest-session"
      />,
    );

    const peer = getCreatedPeers()[0];

    act(() => {
      peer?.emitOpen();
      peer?.outboundConnections[0]?.emitOpen();
      peer?.outboundConnections[0]?.emitData({
        type: "join_reject",
        reason: "room_full",
        message: "This room already has a guest connected.",
      } satisfies MultiplayerMessage);
    });

    expect(screen.getByText("Multiplayer unavailable")).toBeInTheDocument();
    expect(screen.getByText("This room already has a guest connected.")).toBeInTheDocument();
    expect(loadStoredMultiplayerSessions(window.localStorage)).toEqual({});
  });

  it("updates copy button state for successful and failed invite copies", async () => {
    const sessionRecord = createMultiplayerSessionRecord({
      clientId: "host-client",
      date: "2026-03-08",
      displayName: "Host",
      role: "host",
      sessionId: "host-session",
      updatedAt: "2026-03-08T12:00:00.000Z",
    });

    seedMultiplayerStorage({
      [sessionRecord.sessionId]: sessionRecord,
    });

    render(
      <MultiplayerScreen
        puzzle={makePuzzle()}
        selectedDate="2026-03-08"
        sessionId="host-session"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Copy invite link" }));
    expect(await screen.findByRole("button", { name: "Invite copied" })).toBeInTheDocument();
    expect(getClipboardWrites()).toEqual([
      `${window.location.origin}/multiplayer?date=2026-03-08&session=host-session`,
    ]);

    rejectNextClipboardWrite();
    fireEvent.click(screen.getByRole("button", { name: "Invite copied" }));
    expect(await screen.findByRole("button", { name: "Copy failed" })).toBeInTheDocument();
  });

  it("ends host sessions, notifies the guest, clears storage, and routes home", async () => {
    const sessionRecord = createMultiplayerSessionRecord({
      clientId: "host-client",
      date: "2026-03-08",
      displayName: "Host",
      role: "host",
      sessionId: "host-session",
      updatedAt: "2026-03-08T12:00:00.000Z",
    });

    seedMultiplayerStorage({
      [sessionRecord.sessionId]: sessionRecord,
    });

    render(
      <MultiplayerScreen
        puzzle={makePuzzle()}
        selectedDate="2026-03-08"
        sessionId="host-session"
      />,
    );

    const peer = getCreatedPeers()[0];

    act(() => {
      peer?.emitOpen();
    });

    let connection: ReturnType<NonNullable<typeof peer>["emitIncomingConnection"]> | undefined;

    act(() => {
      connection = peer?.emitIncomingConnection();
    });

    act(() => {
      connection?.emitData({
        type: "join_request",
        clientId: "guest-client",
        date: "2026-03-08",
        displayName: "Guest",
        sessionId: "host-session",
      } satisfies MultiplayerMessage);
    });

    fireEvent.click(await screen.findByRole("button", { name: "End session" }));

    expect(connection?.sentMessages).toContainEqual({ type: "session_end" });
    expect(loadStoredMultiplayerSessions(window.localStorage)).toEqual({});
    expect(routerMock.push).toHaveBeenCalledWith("/?date=2026-03-08");
  });

  it("surfaces non-retriable peer errors", () => {
    queueRandomUUIDs("guest-client");

    render(
      <MultiplayerScreen
        puzzle={makePuzzle()}
        selectedDate="2026-03-08"
        sessionId="guest-session"
      />,
    );

    act(() => {
      getCreatedPeers()[0]?.emitError({
        message: "Peer server unavailable",
        type: "weird-error",
      });
    });

    expect(screen.getByText("Multiplayer unavailable")).toBeInTheDocument();
    expect(screen.getByText("Peer server unavailable")).toBeInTheDocument();
  });
});
