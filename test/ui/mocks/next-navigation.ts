import { vi } from "vitest";

export type RouterMock = {
  back: ReturnType<typeof vi.fn>;
  forward: ReturnType<typeof vi.fn>;
  prefetch: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  replace: ReturnType<typeof vi.fn>;
};

export let routerMock = createRouterMock();

export function createRouterMock(): RouterMock {
  return {
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  };
}

export function resetRouterMock() {
  routerMock = createRouterMock();
}

export function useRouter() {
  return routerMock;
}

export function redirect(url: string): never {
  throw new Error(`redirect:${url}`);
}
