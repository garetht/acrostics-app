import React from "react";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";

import { resetRouterMock } from "./mocks/next-navigation";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    scroll: _scroll,
    ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    prefetch?: boolean;
    scroll?: boolean;
  }) => React.createElement("a", { href, ...props }, children),
}));

vi.mock("next/navigation", () => import("./mocks/next-navigation"));

beforeAll(() => {
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      return window.setTimeout(() => {
        callback(performance.now());
      }, 0);
    },
    writable: true,
  });

  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: (handle: number) => {
      window.clearTimeout(handle);
    },
    writable: true,
  });

  if (!HTMLElement.prototype.scrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  }
});

beforeEach(() => {
  resetRouterMock();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});
