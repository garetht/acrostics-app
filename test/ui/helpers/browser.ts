import { vi } from "vitest";

export async function flushTimers() {
  await vi.runOnlyPendingTimersAsync();
}
