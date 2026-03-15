"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  acceptHostMultiplayerChanges,
  applyMultiplayerPatch,
  applyOptimisticMultiplayerChanges,
  createMultiplayerSessionRecord,
  deleteStoredMultiplayerSession,
  getStoredMultiplayerSession,
  pruneStoredMultiplayerSessions,
  restoreMultiplayerSessionRecord,
  saveStoredMultiplayerSession,
  toMultiplayerSnapshot,
  type MultiplayerMessage,
  type MultiplayerPresence,
  type MultiplayerRole,
  type MultiplayerSessionRecord,
} from "@/lib/acrostics-multiplayer";
import { normalizePuzzle, type XWordInfoPuzzle } from "./acrostic";
import { AcrosticBoard, type AcrosticBoardPresence } from "./acrostic-board";
import {
  multiplayerRuntime,
  type MultiplayerConnection,
  type MultiplayerPeer,
} from "./multiplayer-runtime";
import {
  buildInviteUrl,
  getPeerErrorMessage,
} from "./multiplayer-screen.helpers";

type MultiplayerScreenProps = {
  puzzle: XWordInfoPuzzle;
  selectedDate: string;
  sessionId: string;
};

type SessionPhase =
  | "initializing"
  | "hosting"
  | "joining"
  | "connected"
  | "reconnecting"
  | "rejected"
  | "error";

function isMultiplayerMessage(value: unknown): value is MultiplayerMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return typeof (value as { type?: unknown }).type === "string";
}

function toBoardEntries(
  entriesByNumber: MultiplayerSessionRecord["entriesByNumber"],
): Record<number, string> {
  const boardEntries: Record<number, string> = {};

  for (const [key, value] of Object.entries(entriesByNumber)) {
    const number = Number.parseInt(key, 10);

    if (Number.isInteger(number) && number > 0) {
      boardEntries[number] = value;
    }
  }

  return boardEntries;
}

function getRejectedMessage(reason: MultiplayerMessage & { type: "join_reject" }) {
  return reason.message;
}

export function MultiplayerScreen({
  puzzle,
  selectedDate,
  sessionId,
}: MultiplayerScreenProps) {
  const router = useRouter();
  const normalized = normalizePuzzle(puzzle);

  const [sessionRecord, setSessionRecord] = useState<MultiplayerSessionRecord | null>(null);
  const [role, setRole] = useState<MultiplayerRole | null>(null);
  const [phase, setPhase] = useState<SessionPhase>("initializing");
  const [statusMessage, setStatusMessage] = useState("Preparing multiplayer session...");
  const [remotePresence, setRemotePresence] = useState<AcrosticBoardPresence | null>(null);
  const [remoteFlashNumbers, setRemoteFlashNumbers] = useState<number[]>([]);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  const sessionRecordRef = useRef<MultiplayerSessionRecord | null>(null);
  const roleRef = useRef<MultiplayerRole | null>(null);
  const peerRef = useRef<MultiplayerPeer | null>(null);
  const connectionRef = useRef<MultiplayerConnection | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const remoteFlashTimerRef = useRef<number | null>(null);
  const manualShutdownRef = useRef(false);
  const hostRetryCountRef = useRef(0);
  const guestRetryCountRef = useRef(0);

  const boardEntries = sessionRecord ? toBoardEntries(sessionRecord.entriesByNumber) : {};
  const inviteUrl = buildInviteUrl(sessionId, selectedDate);
  const isGuestReadOnly = role === "guest" && phase !== "connected";
  const hasTerminalError = phase === "rejected" || phase === "error";

  function clearReconnectTimer() {
    multiplayerRuntime.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }

  function clearRemoteFlashTimer() {
    multiplayerRuntime.clearTimeout(remoteFlashTimerRef.current);
    remoteFlashTimerRef.current = null;
  }

  function flashRemoteChanges(numbers: number[]) {
    clearRemoteFlashTimer();
    setRemoteFlashNumbers(numbers);
    remoteFlashTimerRef.current = multiplayerRuntime.setTimeout(() => {
      setRemoteFlashNumbers([]);
      remoteFlashTimerRef.current = null;
    }, 1300);
  }

  function replaceSessionRecord(nextRecord: MultiplayerSessionRecord) {
    sessionRecordRef.current = nextRecord;
    setSessionRecord(nextRecord);
  }

  function clearStoredSession() {
    if (typeof window === "undefined") {
      return;
    }

    deleteStoredMultiplayerSession(window.localStorage, sessionId);
  }

  function destroyPeer() {
    connectionRef.current?.close();
    connectionRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
  }

  function leaveSession(pushHome = true) {
    manualShutdownRef.current = true;
    clearReconnectTimer();
    clearRemoteFlashTimer();

    if (roleRef.current === "host" && connectionRef.current?.open) {
      connectionRef.current.send({ type: "session_end" } satisfies MultiplayerMessage);
    }

    destroyPeer();
    clearStoredSession();
    setSessionRecord(null);
    setRemotePresence(null);
    setRemoteFlashNumbers([]);

    if (pushHome) {
      router.push(`/?date=${encodeURIComponent(selectedDate)}`);
    }
  }

  function scheduleGuestReconnect(message: string) {
    clearReconnectTimer();

    if (guestRetryCountRef.current >= 12) {
      setPhase("error");
      setStatusMessage("Unable to reconnect to the host session.");
      return;
    }

    guestRetryCountRef.current += 1;
    setPhase("reconnecting");
    setStatusMessage(message);

    reconnectTimerRef.current = multiplayerRuntime.setTimeout(() => {
      reconnectTimerRef.current = null;
      connectGuestToHost();
    }, 1500);
  }

  function handleHostMessage(
    connection: MultiplayerConnection,
    message: MultiplayerMessage,
  ) {
    const currentRecord = sessionRecordRef.current;

    if (!currentRecord) {
      return;
    }

    if (message.type === "join_request") {
      const activeConnection = connectionRef.current;

      if (currentRecord.status === "ended") {
        connection.send({
          type: "join_reject",
          reason: "session_ended",
          message: "This multiplayer session has already ended.",
        });
        connection.close();
        return;
      }

      if (message.date !== selectedDate || message.sessionId !== sessionId) {
        connection.send({
          type: "join_reject",
          reason: "date_mismatch",
          message: `This room is for ${selectedDate}.`,
        });
        connection.close();
        return;
      }

      if (activeConnection && activeConnection !== connection && activeConnection.open) {
        connection.send({
          type: "join_reject",
          reason: "room_full",
          message: "This room already has a guest connected.",
        });
        connection.close();
        return;
      }

      connectionRef.current = connection;
      guestRetryCountRef.current = 0;
      setRemotePresence(null);
      setPhase("connected");
      setStatusMessage(`Connected to ${message.displayName || "Guest"}.`);
      connection.send({
        type: "join_accept",
        snapshot: toMultiplayerSnapshot(currentRecord),
        hostDisplayName: currentRecord.displayName,
      });
      return;
    }

    if (connectionRef.current !== connection) {
      return;
    }

    if (message.type === "client_patch") {
      const accepted = acceptHostMultiplayerChanges(
        currentRecord,
        message.patch.changes,
        message.patch.changedBy,
        message.patch.clientOpId,
      );

      replaceSessionRecord(accepted.sessionRecord);
      connection.send({
        type: "state_patch",
        patch: accepted.patch,
      });
      flashRemoteChanges(accepted.patch.changes.map((change) => change.number));
      return;
    }

    if (message.type === "presence_update") {
      setRemotePresence({
        activeClueId: message.presence.activeClueId,
        activeNumber: message.presence.activeNumber,
        displayName: message.presence.displayName,
        surface: message.presence.surface,
        isTyping: message.presence.isTyping,
      });
    }
  }

  function attachHostConnection(connection: MultiplayerConnection) {
    connection.on("data", (raw) => {
      if (!isMultiplayerMessage(raw)) {
        return;
      }

      handleHostMessage(connection, raw);
    });

    connection.on("close", () => {
      if (connectionRef.current === connection && !manualShutdownRef.current) {
        connectionRef.current = null;
        setRemotePresence(null);
        setPhase("hosting");
        setStatusMessage("Guest disconnected. Keep the invite link open to reconnect.");
      }
    });

    connection.on("error", () => {
      if (connectionRef.current === connection && !manualShutdownRef.current) {
        connectionRef.current = null;
        setRemotePresence(null);
        setPhase("hosting");
        setStatusMessage("Guest connection dropped. Keep the invite link open to reconnect.");
      }
    });
  }

  function handleGuestMessage(message: MultiplayerMessage) {
    const currentRecord = sessionRecordRef.current;

    if (!currentRecord) {
      return;
    }

    if (message.type === "join_accept") {
      const restoredRecord = restoreMultiplayerSessionRecord(
        currentRecord,
        message.snapshot,
      );

      guestRetryCountRef.current = 0;
      setRemotePresence(null);
      replaceSessionRecord(restoredRecord);
      setPhase("connected");
      setStatusMessage(`Connected to ${message.hostDisplayName || "Host"}.`);
      return;
    }

    if (message.type === "join_reject") {
      clearStoredSession();
      destroyPeer();
      setPhase("rejected");
      setStatusMessage(getRejectedMessage(message));
      return;
    }

    if (message.type === "state_patch") {
      const nextRecord = applyMultiplayerPatch(currentRecord, message.patch);
      replaceSessionRecord(nextRecord);

      if (message.patch.changedBy !== currentRecord.clientId) {
        flashRemoteChanges(message.patch.changes.map((change) => change.number));
      }

      return;
    }

    if (message.type === "presence_update") {
      const presence = message.presence;

      if (presence.clientId === currentRecord.clientId) {
        return;
      }

      setRemotePresence({
        activeClueId: presence.activeClueId,
        activeNumber: presence.activeNumber,
        displayName: presence.displayName,
        surface: presence.surface,
        isTyping: presence.isTyping,
      });
      return;
    }

    if (message.type === "session_end") {
      leaveSession(true);
    }
  }

  function connectGuestToHost() {
    const peer = peerRef.current;
    const currentRecord = sessionRecordRef.current;

    if (!currentRecord) {
      return;
    }

    if (!peer || peer.destroyed) {
      bootGuestPeer();
      return;
    }

    if (connectionRef.current?.open) {
      return;
    }

    connectionRef.current?.close();

    const connection = peer.connect(sessionId, { reliable: true });
    connectionRef.current = connection;
    setPhase("joining");
    setStatusMessage("Connecting to the host session...");

    connection.on("open", () => {
      connection.send({
        type: "join_request",
        sessionId,
        date: selectedDate,
        clientId: currentRecord.clientId,
        displayName: currentRecord.displayName,
      });
      setStatusMessage("Joining the host session...");
    });

    connection.on("data", (raw) => {
      if (!isMultiplayerMessage(raw)) {
        return;
      }

      handleGuestMessage(raw);
    });

    connection.on("close", () => {
      if (manualShutdownRef.current) {
        return;
      }

      connectionRef.current = null;
      setRemotePresence(null);
      scheduleGuestReconnect("Connection lost. Waiting for the host to reconnect...");
    });

    connection.on("error", () => {
      if (manualShutdownRef.current) {
        return;
      }

      connectionRef.current = null;
      setRemotePresence(null);
      scheduleGuestReconnect("Unable to reach the host. Retrying...");
    });
  }

  function bootGuestPeer() {
    const peer = multiplayerRuntime.createPeer();
    peerRef.current = peer;

    peer.on("open", () => {
      guestRetryCountRef.current = 0;
      connectGuestToHost();
    });

    peer.on("error", (error) => {
      const errorType =
        error && typeof error === "object" && "type" in error
          ? String((error as { type?: unknown }).type)
          : "";

      if (
        errorType === "peer-unavailable" ||
        errorType === "network" ||
        errorType === "server-error"
      ) {
        scheduleGuestReconnect("Waiting for the host to become available...");
        return;
      }

      setPhase("error");
      setStatusMessage(getPeerErrorMessage(error));
    });

    peer.on("close", () => {
      if (manualShutdownRef.current) {
        return;
      }

      peerRef.current = null;
      scheduleGuestReconnect("Peer connection closed. Retrying...");
    });
  }

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    pruneStoredMultiplayerSessions(window.localStorage);

    const storedSession = getStoredMultiplayerSession(window.localStorage, sessionId);

    if (storedSession && storedSession.date === selectedDate) {
      sessionRecordRef.current = storedSession;
      setSessionRecord(storedSession);
      setRole(storedSession.role);
      setPhase(storedSession.role === "host" ? "hosting" : "joining");
      setStatusMessage(
        storedSession.role === "host"
          ? "Restoring host session..."
          : "Reconnecting to the host session...",
      );
      return;
    }

    const guestRecord = createMultiplayerSessionRecord({
      sessionId,
      date: selectedDate,
      role: "guest",
      clientId: multiplayerRuntime.randomUUID(),
      displayName: "Guest",
    });

    sessionRecordRef.current = guestRecord;
    setSessionRecord(guestRecord);
    setRole("guest");
    setPhase("joining");
    setStatusMessage("Connecting to the host session...");
  }, [selectedDate, sessionId]);

  useEffect(() => {
    if (!sessionRecord || typeof window === "undefined") {
      return;
    }

    sessionRecordRef.current = sessionRecord;
    saveStoredMultiplayerSession(window.localStorage, sessionRecord);
  }, [sessionRecord]);

  useEffect(() => {
    if (!role) {
      return;
    }

    manualShutdownRef.current = false;
    clearReconnectTimer();
    destroyPeer();

    if (role === "host") {
      const createHostPeer = () => {
        const peer = multiplayerRuntime.createPeer(sessionId);
        peerRef.current = peer;

        peer.on("open", () => {
          hostRetryCountRef.current = 0;
          setPhase(connectionRef.current?.open ? "connected" : "hosting");
          setStatusMessage(
            connectionRef.current?.open
              ? "Guest connection restored."
              : "Host session is live. Share the invite link to connect a guest.",
          );
        });

        peer.on("connection", (connection) => {
          attachHostConnection(connection);
        });

        peer.on("error", (error) => {
          const errorType =
            error && typeof error === "object" && "type" in error
              ? String((error as { type?: unknown }).type)
              : "";

          if (errorType === "unavailable-id" && hostRetryCountRef.current < 8) {
            hostRetryCountRef.current += 1;
            setPhase("reconnecting");
            setStatusMessage("Reclaiming the host session...");
            clearReconnectTimer();
            reconnectTimerRef.current = multiplayerRuntime.setTimeout(() => {
              reconnectTimerRef.current = null;
              destroyPeer();
              createHostPeer();
            }, 1200);
            return;
          }

          setPhase("error");
          setStatusMessage(getPeerErrorMessage(error));
        });

        peer.on("close", () => {
          if (manualShutdownRef.current) {
            return;
          }

          setPhase("reconnecting");
          setStatusMessage("Host connection closed. Reclaiming the room...");
          clearReconnectTimer();
          reconnectTimerRef.current = multiplayerRuntime.setTimeout(() => {
            reconnectTimerRef.current = null;
            destroyPeer();
            createHostPeer();
          }, 1200);
        });
      };

      createHostPeer();
    } else {
      bootGuestPeer();
    }

    return () => {
      manualShutdownRef.current = true;
      clearReconnectTimer();
      destroyPeer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the PeerJS boot functions intentionally close over the current session id and role.
  }, [role, sessionId]);

  useEffect(() => {
    return () => {
      clearReconnectTimer();
      clearRemoteFlashTimer();
    };
  }, []);

  return (
    <div className="min-h-screen px-[var(--page-shell-inline-padding)] py-[var(--page-shell-block-padding)]">
      <main
        className="mx-auto flex w-full max-w-[var(--page-shell-max-width)] flex-col gap-[var(--page-shell-gap)]"
        data-testid="multiplayer-layout"
      >
        <header className="rounded-[2rem] border border-[color:var(--line)] bg-[color:var(--panel)] p-[var(--surface-padding)] shadow-[0_24px_70px_-40px_rgba(60,36,18,0.45)] md:p-[var(--surface-padding-lg)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.38em] text-[color:var(--remote-ink)]">
                Peer-to-peer multiplayer
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                Shared acrostic session
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">
                {normalized.meta.quote}
              </p>
              {!hasTerminalError ? (
                <p className="mt-4 text-sm font-semibold text-[color:var(--remote-ink)]">
                  {statusMessage}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 xl:items-end">
              <div className="text-sm text-[color:var(--muted)] xl:text-right">
                <p>{normalized.meta.date}</p>
                {normalized.meta.copyright ? <p>{normalized.meta.copyright}</p> : null}
                <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em]">
                  {sessionId}
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5 xl:justify-end">
                {role === "host" ? (
                  <button
                    className="rounded-full border border-[color:var(--remote-accent)] bg-[color:var(--remote-soft)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--remote-ink)] transition hover:bg-[#c8daef]"
                    onClick={async () => {
                      try {
                        await multiplayerRuntime.writeClipboardText(inviteUrl);
                        setCopyStatus("copied");
                      } catch {
                        setCopyStatus("error");
                      }
                    }}
                    type="button"
                  >
                    {copyStatus === "copied"
                      ? "Invite copied"
                      : copyStatus === "error"
                        ? "Copy failed"
                        : "Copy invite link"}
                  </button>
                ) : null}

                <button
                  className={
                    role === "host"
                      ? "rounded-full border border-[color:var(--danger)] bg-[color:var(--danger)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[#b94f3f]"
                      : "rounded-full border border-[color:var(--line)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--foreground)] transition hover:bg-[color:var(--panel-strong)]"
                  }
                  onClick={() => {
                    leaveSession(true);
                  }}
                  type="button"
                >
                  {role === "host" ? "End session" : "Leave session"}
                </button>

              </div>
            </div>
          </div>
        </header>

        {hasTerminalError ? (
          <section className="rounded-[2rem] border border-[color:var(--danger)] bg-[color:var(--danger-soft)] p-[var(--surface-padding)] shadow-[0_18px_40px_-30px_rgba(92,31,23,0.42)]">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--danger-ink)]">
              Multiplayer unavailable
            </p>
            <p className="mt-3 text-lg font-semibold tracking-[-0.02em] text-[color:var(--foreground)]">
              {statusMessage}
            </p>
          </section>
        ) : null}

        {sessionRecord ? (
          <AcrosticBoard
            entriesByNumber={boardEntries}
            isReadOnly={isGuestReadOnly}
            onEntriesPatch={(changes) => {
              const currentRecord = sessionRecordRef.current;

              if (!currentRecord) {
                return;
              }

              if (roleRef.current === "host") {
                const accepted = acceptHostMultiplayerChanges(
                  currentRecord,
                  changes,
                  currentRecord.clientId,
                  multiplayerRuntime.randomUUID(),
                );

                replaceSessionRecord(accepted.sessionRecord);
                connectionRef.current?.send({
                  type: "state_patch",
                  patch: accepted.patch,
                });
                return;
              }

              const optimisticRecord = applyOptimisticMultiplayerChanges(
                currentRecord,
                changes,
              );

              replaceSessionRecord(optimisticRecord);
              connectionRef.current?.send({
                type: "client_patch",
                patch: {
                  clientOpId: multiplayerRuntime.randomUUID(),
                  changedBy: currentRecord.clientId,
                  changes,
                },
              });
            }}
            onPresenceChange={(presenceState) => {
              const currentRecord = sessionRecordRef.current;

              if (!currentRecord || !connectionRef.current?.open) {
                return;
              }

              const presence: MultiplayerPresence = {
                clientId: currentRecord.clientId,
                displayName: currentRecord.displayName,
                activeClueId: presenceState.activeClueId,
                activeNumber: presenceState.activeNumber,
                surface: presenceState.surface,
                isTyping: presenceState.isTyping,
              };

              connectionRef.current.send({
                type: "presence_update",
                presence,
              });
            }}
            puzzle={puzzle}
            remoteFlashNumbers={remoteFlashNumbers}
            remotePresence={remotePresence}
          />
        ) : null}
      </main>
    </div>
  );
}
