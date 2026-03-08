import { Peer } from "peerjs";

import type { MultiplayerMessage } from "@/lib/acrostics-multiplayer";

type MultiplayerConnectionEventMap = {
  close: () => void;
  data: (message: unknown) => void;
  error: (error: unknown) => void;
  open: () => void;
};

type MultiplayerPeerEventMap = {
  close: () => void;
  connection: (connection: MultiplayerConnection) => void;
  error: (error: unknown) => void;
  open: () => void;
};

export type MultiplayerConnection = {
  open: boolean;
  close: () => void;
  send: (message: MultiplayerMessage) => void;
  on: <TEvent extends keyof MultiplayerConnectionEventMap>(
    event: TEvent,
    handler: MultiplayerConnectionEventMap[TEvent],
  ) => void;
};

export type MultiplayerPeer = {
  destroyed: boolean;
  connect: (
    peerId: string,
    options?: {
      reliable?: boolean;
    },
  ) => MultiplayerConnection;
  destroy: () => void;
  on: <TEvent extends keyof MultiplayerPeerEventMap>(
    event: TEvent,
    handler: MultiplayerPeerEventMap[TEvent],
  ) => void;
};

export type MultiplayerRuntime = {
  clearTimeout: (timeoutId: number | null | undefined) => void;
  createPeer: (id?: string) => MultiplayerPeer;
  randomUUID: () => string;
  setTimeout: (handler: () => void, delayMs: number) => number;
  writeClipboardText: (value: string) => Promise<void>;
};

export const multiplayerRuntime: MultiplayerRuntime = {
  clearTimeout(timeoutId) {
    if (typeof timeoutId === "number") {
      window.clearTimeout(timeoutId);
    }
  },
  createPeer(id) {
    return new Peer(id) as unknown as MultiplayerPeer;
  },
  randomUUID() {
    return crypto.randomUUID();
  },
  setTimeout(handler, delayMs) {
    return window.setTimeout(handler, delayMs);
  },
  writeClipboardText(value) {
    return navigator.clipboard.writeText(value);
  },
};
