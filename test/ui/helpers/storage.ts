import {
  ACROSTIC_PROGRESS_STORAGE_KEY,
  serializeStoredAcrosticProgress,
  type StoredAcrosticProgressMap,
} from "@/lib/acrostics-progress";
import {
  ACROSTIC_MULTIPLAYER_STORAGE_KEY,
  serializeStoredMultiplayerSessions,
  type StoredMultiplayerSessionMap,
} from "@/lib/acrostics-multiplayer";

export function seedProgressStorage(progressMap: StoredAcrosticProgressMap) {
  window.localStorage.setItem(
    ACROSTIC_PROGRESS_STORAGE_KEY,
    serializeStoredAcrosticProgress(progressMap),
  );
}

export function seedMultiplayerStorage(sessionMap: StoredMultiplayerSessionMap) {
  window.localStorage.setItem(
    ACROSTIC_MULTIPLAYER_STORAGE_KEY,
    serializeStoredMultiplayerSessions(sessionMap),
  );
}
