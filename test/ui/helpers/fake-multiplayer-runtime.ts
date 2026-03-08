import type { MultiplayerMessage } from "@/lib/acrostics-multiplayer";

type ConnectionHandlers = {
  close: Array<() => void>;
  data: Array<(message: unknown) => void>;
  error: Array<(error: unknown) => void>;
  open: Array<() => void>;
};

type PeerHandlers = {
  close: Array<() => void>;
  connection: Array<(connection: FakeConnection) => void>;
  error: Array<(error: unknown) => void>;
  open: Array<() => void>;
};

export class FakeConnection {
  open = false;
  readonly peerId: string;
  readonly sentMessages: MultiplayerMessage[] = [];
  private readonly handlers: ConnectionHandlers = {
    close: [],
    data: [],
    error: [],
    open: [],
  };

  constructor(peerId: string) {
    this.peerId = peerId;
  }

  close() {
    this.open = false;
    this.emit("close");
  }

  emit<TEvent extends keyof ConnectionHandlers>(
    event: TEvent,
    payload?: Parameters<ConnectionHandlers[TEvent][number]>[0],
  ) {
    for (const handler of this.handlers[event]) {
      if (typeof payload === "undefined") {
        (handler as () => void)();
        continue;
      }

      (handler as (value: Parameters<ConnectionHandlers[TEvent][number]>[0]) => void)(
        payload,
      );
    }
  }

  emitClose() {
    this.open = false;
    this.emit("close");
  }

  emitData(message: unknown) {
    this.emit("data", message);
  }

  emitError(error: unknown) {
    this.emit("error", error);
  }

  emitOpen() {
    this.open = true;
    this.emit("open");
  }

  on<TEvent extends keyof ConnectionHandlers>(
    event: TEvent,
    handler: ConnectionHandlers[TEvent][number],
  ) {
    (
      this.handlers[event] as Array<ConnectionHandlers[TEvent][number]>
    ).push(handler);
  }

  send(message: MultiplayerMessage) {
    this.sentMessages.push(message);
  }
}

export class FakePeer {
  destroyed = false;
  readonly id?: string;
  readonly outboundConnections: FakeConnection[] = [];
  private readonly handlers: PeerHandlers = {
    close: [],
    connection: [],
    error: [],
    open: [],
  };

  constructor(id?: string) {
    this.id = id;
  }

  connect(peerId: string, options?: { reliable?: boolean }) {
    void options;
    const connection = new FakeConnection(peerId);
    this.outboundConnections.push(connection);
    return connection;
  }

  destroy() {
    this.destroyed = true;
  }

  emit<TEvent extends keyof PeerHandlers>(
    event: TEvent,
    payload?: Parameters<PeerHandlers[TEvent][number]>[0],
  ) {
    for (const handler of this.handlers[event]) {
      if (typeof payload === "undefined") {
        (handler as () => void)();
        continue;
      }

      (handler as (value: Parameters<PeerHandlers[TEvent][number]>[0]) => void)(
        payload,
      );
    }
  }

  emitClose() {
    this.emit("close");
  }

  emitError(error: unknown) {
    this.emit("error", error);
  }

  emitIncomingConnection(connection = new FakeConnection(this.id ?? "incoming")) {
    this.emit("connection", connection);
    return connection;
  }

  emitOpen() {
    this.emit("open");
  }

  on<TEvent extends keyof PeerHandlers>(
    event: TEvent,
    handler: PeerHandlers[TEvent][number],
  ) {
    (this.handlers[event] as Array<PeerHandlers[TEvent][number]>).push(handler);
  }
}

const createdPeers: FakePeer[] = [];
const clipboardWrites: string[] = [];
const queuedRandomUUIDs: string[] = [];
let nextClipboardError: unknown = null;

export const fakeMultiplayerRuntime = {
  clearTimeout(timeoutId: number | null | undefined) {
    if (typeof timeoutId === "number") {
      window.clearTimeout(timeoutId);
    }
  },
  createPeer(id?: string) {
    const peer = new FakePeer(id);
    createdPeers.push(peer);
    return peer;
  },
  randomUUID() {
    return queuedRandomUUIDs.shift() ?? "runtime-uuid";
  },
  setTimeout(handler: () => void, delayMs: number) {
    return window.setTimeout(handler, delayMs);
  },
  async writeClipboardText(value: string) {
    clipboardWrites.push(value);

    if (nextClipboardError) {
      const error = nextClipboardError;
      nextClipboardError = null;
      throw error;
    }
  },
};

export function getClipboardWrites() {
  return [...clipboardWrites];
}

export function getCreatedPeers() {
  return [...createdPeers];
}

export function queueRandomUUIDs(...values: string[]) {
  queuedRandomUUIDs.push(...values);
}

export function rejectNextClipboardWrite(error = new Error("copy failed")) {
  nextClipboardError = error;
}

export function resetFakeMultiplayerRuntime() {
  createdPeers.length = 0;
  clipboardWrites.length = 0;
  queuedRandomUUIDs.length = 0;
  nextClipboardError = null;
}
