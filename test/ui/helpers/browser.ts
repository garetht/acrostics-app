import { act } from "@testing-library/react";
import { vi } from "vitest";

export async function flushTimers() {
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
}
