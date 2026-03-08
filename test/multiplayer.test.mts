import assert from "node:assert/strict";
import test from "node:test";

import { ACROSTIC_PROGRESS_STORAGE_KEY } from "../lib/acrostics-progress.ts";
import {
  ACROSTIC_MULTIPLAYER_STORAGE_KEY,
  acceptHostMultiplayerChanges,
  applyMultiplayerPatch,
  applyOptimisticMultiplayerChanges,
  createMultiplayerSessionRecord,
  deleteStoredMultiplayerSession,
  getStoredMultiplayerSession,
  loadStoredMultiplayerSessions,
  pruneStoredMultiplayerSessions,
  restoreMultiplayerSessionRecord,
  saveStoredMultiplayerSession,
  toMultiplayerSnapshot,
} from "../lib/acrostics-multiplayer.ts";

test("multiplayer storage does not mutate solo progress storage", () => {
  const storage = createStorage({
    [ACROSTIC_PROGRESS_STORAGE_KEY]: '{"2026-03-08":{"entriesByNumber":{"1":"A"},"updatedAt":"2026-03-08T12:00:00.000Z"}}',
  });
  const record = createMultiplayerSessionRecord({
    sessionId: "session-1",
    date: "2026-03-08",
    role: "host",
    clientId: "host-1",
    displayName: "Host",
    updatedAt: "2026-03-08T13:00:00.000Z",
  });

  saveStoredMultiplayerSession(storage, record);
  deleteStoredMultiplayerSession(storage, "session-1");

  assert.equal(
    storage.getItem(ACROSTIC_PROGRESS_STORAGE_KEY),
    '{"2026-03-08":{"entriesByNumber":{"1":"A"},"updatedAt":"2026-03-08T12:00:00.000Z"}}',
  );
  assert.deepEqual(
    loadStoredMultiplayerSessions(storage),
    {},
  );
});

test("host patches assign monotonic session sequences and stale changes lose conflicts", () => {
  const baseRecord = createMultiplayerSessionRecord({
    sessionId: "session-1",
    date: "2026-03-08",
    role: "host",
    clientId: "host-1",
    displayName: "Host",
    updatedAt: "2026-03-08T13:00:00.000Z",
  });
  const { patch: firstPatch, sessionRecord: firstRecord } =
    acceptHostMultiplayerChanges(
      baseRecord,
      [
        { number: 12, value: "a" },
        { number: 13, value: "b" },
      ],
      "host-1",
      "op-1",
      "2026-03-08T13:01:00.000Z",
    );

  assert.deepEqual(firstPatch.changes, [
    { number: 12, value: "A", sessionSeq: 1 },
    { number: 13, value: "B", sessionSeq: 2 },
  ]);
  assert.equal(firstRecord.sessionSeq, 2);
  assert.deepEqual(firstRecord.entriesByNumber, { "12": "A", "13": "B" });

  const losingPatch = {
    clientOpId: "op-2",
    changedBy: "guest-1",
    changes: [{ number: 12, value: "Z", sessionSeq: 1 }],
  };
  const winningPatch = {
    clientOpId: "op-3",
    changedBy: "guest-1",
    changes: [{ number: 12, value: "Y", sessionSeq: 3 }],
  };

  const staleApplied = applyMultiplayerPatch(
    firstRecord,
    losingPatch,
    "2026-03-08T13:02:00.000Z",
  );
  const finalApplied = applyMultiplayerPatch(
    staleApplied,
    winningPatch,
    "2026-03-08T13:03:00.000Z",
  );

  assert.equal(staleApplied.entriesByNumber["12"], "A");
  assert.equal(finalApplied.entriesByNumber["12"], "Y");
  assert.equal(finalApplied.cellSessionSeqByNumber["12"], 3);
  assert.equal(finalApplied.sessionSeq, 3);
});

test("optimistic guest edits can be overwritten by later canonical host patches", () => {
  const guestRecord = createMultiplayerSessionRecord({
    sessionId: "session-1",
    date: "2026-03-08",
    role: "guest",
    clientId: "guest-1",
    displayName: "Guest",
    updatedAt: "2026-03-08T13:00:00.000Z",
  });
  const optimistic = applyOptimisticMultiplayerChanges(
    guestRecord,
    [{ number: 9, value: "q" }],
    "2026-03-08T13:01:00.000Z",
  );
  const canonical = applyMultiplayerPatch(
    optimistic,
    {
      clientOpId: "op-4",
      changedBy: "host-1",
      changes: [{ number: 9, value: "R", sessionSeq: 4 }],
    },
    "2026-03-08T13:02:00.000Z",
  );

  assert.equal(optimistic.entriesByNumber["9"], "Q");
  assert.equal(canonical.entriesByNumber["9"], "R");
  assert.equal(canonical.cellSessionSeqByNumber["9"], 4);
});

test("stored sessions can be restored from snapshots and pruned when stale", () => {
  const storage = createStorage();
  const hostRecord = createMultiplayerSessionRecord({
    sessionId: "session-restore",
    date: "2026-03-08",
    role: "host",
    clientId: "host-1",
    displayName: "Host",
    updatedAt: "2026-03-08T13:00:00.000Z",
  });
  const { sessionRecord } = acceptHostMultiplayerChanges(
    hostRecord,
    [{ number: 4, value: "K" }],
    "host-1",
    "op-restore",
    "2026-03-08T13:01:00.000Z",
  );

  saveStoredMultiplayerSession(storage, sessionRecord);
  const snapshot = toMultiplayerSnapshot(sessionRecord);
  const restored = restoreMultiplayerSessionRecord(
    createMultiplayerSessionRecord({
      sessionId: "session-restore",
      date: "2026-03-08",
      role: "guest",
      clientId: "guest-1",
      displayName: "Guest",
      updatedAt: "2026-03-08T13:02:00.000Z",
    }),
    snapshot,
    "2026-03-08T13:03:00.000Z",
  );

  assert.deepEqual(restored.entriesByNumber, { "4": "K" });
  assert.equal(restored.sessionSeq, 1);

  pruneStoredMultiplayerSessions(
    storage,
    Date.parse("2026-03-10T13:03:00.000Z"),
    1000,
  );

  assert.equal(storage.getItem(ACROSTIC_MULTIPLAYER_STORAGE_KEY), "{}");
  assert.equal(getStoredMultiplayerSession(storage, "session-restore"), null);
});

function createStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues));

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}
