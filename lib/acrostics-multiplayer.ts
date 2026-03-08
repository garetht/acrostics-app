export const ACROSTIC_MULTIPLAYER_STORAGE_KEY = "acrostics.multiplayer.sessions.v1";

export type MultiplayerRole = "host" | "guest";
export type MultiplayerSessionStatus = "active" | "ended";
export type MultiplayerSurface = "clue" | "grid";

export type MultiplayerSessionRecord = {
  sessionId: string;
  date: string;
  role: MultiplayerRole;
  clientId: string;
  displayName: string;
  entriesByNumber: Record<string, string>;
  cellSessionSeqByNumber: Record<string, number>;
  sessionSeq: number;
  status: MultiplayerSessionStatus;
  updatedAt: string;
};

export type StoredMultiplayerSessionMap = Record<string, MultiplayerSessionRecord>;

export type MultiplayerSnapshot = {
  date: string;
  entriesByNumber: Record<string, string>;
  cellSessionSeqByNumber: Record<string, number>;
  sessionSeq: number;
};

export type MultiplayerDraftChange = {
  number: number;
  value: string;
};

export type MultiplayerPatchChange = {
  number: number;
  value: string;
  sessionSeq: number;
};

export type MultiplayerPatch = {
  clientOpId: string;
  changedBy: string;
  changes: MultiplayerPatchChange[];
};

export type MultiplayerPresence = {
  clientId: string;
  displayName: string;
  activeClueId: string | null;
  activeNumber: number | null;
  surface: MultiplayerSurface;
  isTyping: boolean;
};

export type MultiplayerMessage =
  | {
      type: "join_request";
      sessionId: string;
      date: string;
      clientId: string;
      displayName: string;
    }
  | {
      type: "join_accept";
      snapshot: MultiplayerSnapshot;
      hostDisplayName: string;
    }
  | {
      type: "join_reject";
      reason: "room_full" | "date_mismatch" | "session_ended";
      message: string;
    }
  | {
      type: "client_patch";
      patch: {
        clientOpId: string;
        changedBy: string;
        changes: MultiplayerDraftChange[];
      };
    }
  | {
      type: "state_patch";
      patch: MultiplayerPatch;
    }
  | {
      type: "presence_update";
      presence: MultiplayerPresence;
    }
  | {
      type: "session_end";
    };

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LETTER_PATTERN = /^[A-Z]$/;

function normalizeLetterValue(value: string): string {
  const normalized = value.trim().toUpperCase();
  return LETTER_PATTERN.test(normalized) ? normalized : "";
}

function sanitizeEntriesByNumber(
  record: Record<string, unknown>,
): Record<string, string> {
  const entriesByNumber: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    if (!/^[1-9]\d*$/.test(key) || typeof value !== "string") {
      continue;
    }

    const normalized = normalizeLetterValue(value);

    if (normalized) {
      entriesByNumber[key] = normalized;
    }
  }

  return entriesByNumber;
}

function sanitizeCellSessionSeqByNumber(
  record: Record<string, unknown>,
): Record<string, number> {
  const cellSessionSeqByNumber: Record<string, number> = {};

  for (const [key, value] of Object.entries(record)) {
    if (
      !/^[1-9]\d*$/.test(key) ||
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0
    ) {
      continue;
    }

    cellSessionSeqByNumber[key] = value;
  }

  return cellSessionSeqByNumber;
}

export function parseStoredMultiplayerSessions(
  jsonText: string | null,
): StoredMultiplayerSessionMap {
  if (!jsonText) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  const sessionMap: StoredMultiplayerSessionMap = {};

  for (const [sessionId, rawRecord] of Object.entries(parsed)) {
    if (
      !rawRecord ||
      typeof rawRecord !== "object" ||
      Array.isArray(rawRecord)
    ) {
      continue;
    }

    const record = rawRecord as Record<string, unknown>;
    const {
      cellSessionSeqByNumber,
      clientId,
      date,
      displayName,
      entriesByNumber,
      role,
      sessionSeq,
      status,
      updatedAt,
    } = record;

    if (
      typeof sessionId !== "string" ||
      sessionId.trim().length === 0 ||
      typeof date !== "string" ||
      !ISO_DATE_PATTERN.test(date) ||
      (role !== "host" && role !== "guest") ||
      typeof clientId !== "string" ||
      clientId.trim().length === 0 ||
      typeof displayName !== "string" ||
      displayName.trim().length === 0 ||
      !entriesByNumber ||
      typeof entriesByNumber !== "object" ||
      Array.isArray(entriesByNumber) ||
      !cellSessionSeqByNumber ||
      typeof cellSessionSeqByNumber !== "object" ||
      Array.isArray(cellSessionSeqByNumber) ||
      typeof sessionSeq !== "number" ||
      !Number.isInteger(sessionSeq) ||
      sessionSeq < 0 ||
      (status !== "active" && status !== "ended") ||
      typeof updatedAt !== "string" ||
      updatedAt.trim().length === 0
    ) {
      continue;
    }

    sessionMap[sessionId] = {
      sessionId,
      date,
      role,
      clientId,
      displayName: displayName.trim(),
      entriesByNumber: sanitizeEntriesByNumber(
        entriesByNumber as Record<string, unknown>,
      ),
      cellSessionSeqByNumber: sanitizeCellSessionSeqByNumber(
        cellSessionSeqByNumber as Record<string, unknown>,
      ),
      sessionSeq,
      status,
      updatedAt,
    };
  }

  return sessionMap;
}

export function serializeStoredMultiplayerSessions(
  sessionMap: StoredMultiplayerSessionMap,
): string {
  return JSON.stringify(sessionMap);
}

export function loadStoredMultiplayerSessions(
  storage: Pick<Storage, "getItem">,
): StoredMultiplayerSessionMap {
  return parseStoredMultiplayerSessions(
    storage.getItem(ACROSTIC_MULTIPLAYER_STORAGE_KEY),
  );
}

export function getStoredMultiplayerSession(
  storage: Pick<Storage, "getItem">,
  sessionId: string,
): MultiplayerSessionRecord | null {
  return loadStoredMultiplayerSessions(storage)[sessionId] ?? null;
}

export function writeStoredMultiplayerSessions(
  storage: StorageLike,
  sessionMap: StoredMultiplayerSessionMap,
): StoredMultiplayerSessionMap {
  storage.setItem(
    ACROSTIC_MULTIPLAYER_STORAGE_KEY,
    serializeStoredMultiplayerSessions(sessionMap),
  );
  return sessionMap;
}

export function saveStoredMultiplayerSession(
  storage: StorageLike,
  sessionRecord: MultiplayerSessionRecord,
): StoredMultiplayerSessionMap {
  const sessionMap = loadStoredMultiplayerSessions(storage);
  sessionMap[sessionRecord.sessionId] = sessionRecord;
  return writeStoredMultiplayerSessions(storage, sessionMap);
}

export function deleteStoredMultiplayerSession(
  storage: StorageLike,
  sessionId: string,
): StoredMultiplayerSessionMap {
  const sessionMap = loadStoredMultiplayerSessions(storage);
  delete sessionMap[sessionId];
  return writeStoredMultiplayerSessions(storage, sessionMap);
}

export function pruneStoredMultiplayerSessions(
  storage: StorageLike,
  now = Date.now(),
  maxAgeMs = 1000 * 60 * 60 * 24,
): StoredMultiplayerSessionMap {
  const sessionMap = loadStoredMultiplayerSessions(storage);
  let mutated = false;

  for (const [sessionId, sessionRecord] of Object.entries(sessionMap)) {
    const updatedAt = Date.parse(sessionRecord.updatedAt);

    if (
      !Number.isFinite(updatedAt) ||
      sessionRecord.status === "ended" ||
      now - updatedAt > maxAgeMs
    ) {
      delete sessionMap[sessionId];
      mutated = true;
    }
  }

  if (mutated) {
    return writeStoredMultiplayerSessions(storage, sessionMap);
  }

  return sessionMap;
}

export function createMultiplayerSessionRecord(input: {
  sessionId: string;
  date: string;
  role: MultiplayerRole;
  clientId: string;
  displayName: string;
  updatedAt?: string;
}): MultiplayerSessionRecord {
  return {
    sessionId: input.sessionId,
    date: input.date,
    role: input.role,
    clientId: input.clientId,
    displayName: input.displayName.trim() || (input.role === "host" ? "Host" : "Guest"),
    entriesByNumber: {},
    cellSessionSeqByNumber: {},
    sessionSeq: 0,
    status: "active",
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function toMultiplayerSnapshot(
  sessionRecord: MultiplayerSessionRecord,
): MultiplayerSnapshot {
  return {
    date: sessionRecord.date,
    entriesByNumber: { ...sessionRecord.entriesByNumber },
    cellSessionSeqByNumber: { ...sessionRecord.cellSessionSeqByNumber },
    sessionSeq: sessionRecord.sessionSeq,
  };
}

export function restoreMultiplayerSessionRecord(
  sessionRecord: MultiplayerSessionRecord,
  snapshot: MultiplayerSnapshot,
  updatedAt = new Date().toISOString(),
): MultiplayerSessionRecord {
  return {
    ...sessionRecord,
    date: snapshot.date,
    entriesByNumber: sanitizeEntriesByNumber(snapshot.entriesByNumber),
    cellSessionSeqByNumber: sanitizeCellSessionSeqByNumber(
      snapshot.cellSessionSeqByNumber,
    ),
    sessionSeq: Math.max(0, snapshot.sessionSeq),
    status: "active",
    updatedAt,
  };
}

function sanitizeDraftChanges(
  changes: readonly MultiplayerDraftChange[],
): MultiplayerDraftChange[] {
  const latestChangeByNumber = new Map<number, string>();

  for (const change of changes) {
    if (!Number.isInteger(change.number) || change.number <= 0) {
      continue;
    }

    const normalized = normalizeLetterValue(change.value);
    latestChangeByNumber.set(change.number, normalized);
  }

  return Array.from(latestChangeByNumber.entries()).map(([number, value]) => ({
    number,
    value,
  }));
}

export function applyOptimisticMultiplayerChanges(
  sessionRecord: MultiplayerSessionRecord,
  changes: readonly MultiplayerDraftChange[],
  updatedAt = new Date().toISOString(),
): MultiplayerSessionRecord {
  const nextEntries = { ...sessionRecord.entriesByNumber };

  for (const change of sanitizeDraftChanges(changes)) {
    const key = String(change.number);

    if (!change.value) {
      delete nextEntries[key];
      continue;
    }

    nextEntries[key] = change.value;
  }

  return {
    ...sessionRecord,
    entriesByNumber: nextEntries,
    updatedAt,
  };
}

export function applyMultiplayerPatch(
  sessionRecord: MultiplayerSessionRecord,
  patch: MultiplayerPatch,
  updatedAt = new Date().toISOString(),
): MultiplayerSessionRecord {
  const nextEntries = { ...sessionRecord.entriesByNumber };
  const nextCellSeqByNumber = { ...sessionRecord.cellSessionSeqByNumber };
  let nextSessionSeq = sessionRecord.sessionSeq;

  for (const change of patch.changes) {
    if (!Number.isInteger(change.number) || change.number <= 0) {
      continue;
    }

    if (!Number.isInteger(change.sessionSeq) || change.sessionSeq < 0) {
      continue;
    }

    const key = String(change.number);
    const currentSeq = nextCellSeqByNumber[key] ?? 0;

    if (change.sessionSeq <= currentSeq) {
      continue;
    }

    nextCellSeqByNumber[key] = change.sessionSeq;
    nextSessionSeq = Math.max(nextSessionSeq, change.sessionSeq);

    if (!change.value) {
      delete nextEntries[key];
      continue;
    }

    nextEntries[key] = normalizeLetterValue(change.value);

    if (!nextEntries[key]) {
      delete nextEntries[key];
    }
  }

  return {
    ...sessionRecord,
    entriesByNumber: nextEntries,
    cellSessionSeqByNumber: nextCellSeqByNumber,
    sessionSeq: nextSessionSeq,
    status: "active",
    updatedAt,
  };
}

export function acceptHostMultiplayerChanges(
  sessionRecord: MultiplayerSessionRecord,
  changes: readonly MultiplayerDraftChange[],
  changedBy: string,
  clientOpId: string,
  updatedAt = new Date().toISOString(),
): {
  patch: MultiplayerPatch;
  sessionRecord: MultiplayerSessionRecord;
} {
  const sanitizedChanges = sanitizeDraftChanges(changes);
  let nextSessionSeq = sessionRecord.sessionSeq;

  const patch: MultiplayerPatch = {
    clientOpId,
    changedBy,
    changes: sanitizedChanges.map((change) => {
      nextSessionSeq += 1;

      return {
        number: change.number,
        value: change.value,
        sessionSeq: nextSessionSeq,
      };
    }),
  };

  return {
    patch,
    sessionRecord: applyMultiplayerPatch(sessionRecord, patch, updatedAt),
  };
}
