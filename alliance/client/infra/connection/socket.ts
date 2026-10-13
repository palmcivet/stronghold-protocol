import { PROTOCOL_VERSION } from '@alliance/contract/match.js';
import { validateC2S } from '@alliance/contract/message.js';

export const REQUEST_TIMEOUT_MS = 8000;
export const HELLO_TIMEOUT_MS = 8000;
export const PING_INTERVAL_MS = 4000;
export const DEAD_AFTER_MS = 15000;
export const BACKOFF = Object.freeze({
  base: 500,
  factor: 2,
  max: 10000,
  jitter: 0.2,
});

/** Close code of a session another socket took over. */
export const CLOSE_REPLACED = 4001;
/** Close code of a socket that never sent `hello`. */
export const CLOSE_HELLO_TIMEOUT = 4002;

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'handshaking'
  | 'online'
  | 'reconnecting'
  | 'closed';

/** A server frame. */
export interface Frame {
  readonly t: string;
  readonly rid?: number;
  readonly [field: string]: unknown;
}

/** Client error codes beside the server's error codes. */
export type LocalErrorCode =
  | 'TIMEOUT'
  | 'OFFLINE'
  | 'DISCONNECTED'
  | 'CLOSED'
  | 'REPLACED'
  | 'BAD_MSG';

export class RequestError extends Error {
  readonly code: string;
  readonly serverText: string | null;
  readonly detail: string | null;

  constructor(code: string, serverText?: string | null, detail?: unknown) {
    super(serverText || code);
    this.name = 'RequestError';
    this.code = code;
    this.serverText = serverText ?? null;
    this.detail = typeof detail === 'string' ? detail : null;
  }
}

export interface ConnectionSnapshot {
  readonly status: ConnectionStatus;
  readonly attempt: number;
  /** Epoch ms of the next reconnect, 0 for none. */
  readonly retryAt: number;
  readonly ping: number | null;
  readonly error: RequestError | null;
}

interface SocketLike {
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { readonly code: number }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type SocketFactory = (url: string) => SocketLike;

export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface ConnectionOptions {
  readonly url: string;
  readonly socket?: SocketFactory;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly timers?: Timers;
  /** Reconnect token for `hello`. */
  readonly token?: () => string | null;
  /** Extra `hello` fields. A master backend ignores the fields it does not know. */
  readonly hello?: () => Readonly<Record<string, unknown>>;
}

export type FrameListener = (frame: Frame) => void;

export interface Connection {
  readonly snapshot: () => ConnectionSnapshot;
  /** The last `welcome`. */
  readonly welcome: () => Frame | null;
  connect(): void;
  close(): void;
  retryNow(): void;
  /** Sets the name `hello` carries and sends it when the socket is open. */
  setName(name: string): void;
  /** Sends a request with a `rid` and resolves with its `ok`. Requests made while reconnecting wait for `welcome`. */
  request(
    type: string,
    fields?: Readonly<Record<string, unknown>>,
  ): Promise<Frame>;
  /** Sends a frame without a `rid`. False when it could not be sent. */
  send(type: string, fields?: Readonly<Record<string, unknown>>): boolean;
  /** Subscribes to a frame type, or `*` for every frame. */
  on(type: string, listener: FrameListener): () => void;
  onStatus(listener: (snapshot: ConnectionSnapshot) => void): () => void;
}

const WS_CONNECTING = 0;
const WS_OPEN = 1;

/** Reconnect delay of the n-th consecutive failed attempt, with jitter. */
export function backoffDelay(attempt: number, random: () => number): number {
  const n = Math.max(0, Math.min(30, Math.floor(attempt)));
  const raw = Math.min(BACKOFF.max, BACKOFF.base * BACKOFF.factor ** n);
  const jitter = raw * BACKOFF.jitter * (random() * 2 - 1);
  return Math.max(100, Math.round(raw + jitter));
}

/** `ws(s)://<host>/ws` of the page. */
export function pageSocketUrl(location: {
  readonly protocol: string;
  readonly host: string;
}): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

interface Pending {
  readonly frame: Frame;
  readonly resolve: (frame: Frame) => void;
  readonly reject: (error: RequestError) => void;
  timer: unknown;
  sent: boolean;
}

const browserTimers: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (handle) =>
    globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
};

export function createConnection(options: ConnectionOptions): Connection {
  const makeSocket: SocketFactory =
    options.socket ?? ((url) => new WebSocket(url) as unknown as SocketLike);
  const now = options.now ?? (() => Date.now());
  const random = options.random ?? Math.random;
  const timers = options.timers ?? browserTimers;
  const tokenOf = options.token ?? (() => null);

  let status: ConnectionStatus = 'idle';
  let socket: SocketLike | null = null;
  let name: string | null = null;
  let attempt = 0;
  let retryAt = 0;
  let ping: number | null = null;
  let error: RequestError | null = null;
  let welcome: Frame | null = null;
  let manualClose = false;
  let rid = 0;
  let helloRid: number | null = null;
  let reconnectTimer: unknown = null;
  let pingTimer: unknown = null;
  let helloTimer: unknown = null;
  let unansweredSince: number | null = null;
  const pending = new Map<number, Pending>();
  const listeners = new Map<string, Set<FrameListener>>();
  const statusListeners = new Set<(snapshot: ConnectionSnapshot) => void>();

  const snapshot = (): ConnectionSnapshot => ({
    status,
    attempt,
    retryAt,
    ping,
    error,
  });

  function setStatus(next: ConnectionStatus): void {
    status = next;
    const current = snapshot();
    for (const listener of [...statusListeners]) {
      listener(current);
    }
  }

  function emit(frame: Frame): void {
    for (const type of [frame.t, '*']) {
      for (const listener of [...(listeners.get(type) ?? [])]) {
        try {
          listener(frame);
        } catch (failure) {
          console.error(`[connection] listener of ${type} failed`, failure);
        }
      }
    }
  }

  const nextRid = (): number => {
    rid = (rid % 2147483000) + 1;
    return rid;
  };

  function sendRaw(frame: Readonly<Record<string, unknown>>): boolean {
    if (!socket || socket.readyState !== WS_OPEN) {
      return false;
    }
    try {
      socket.send(JSON.stringify(frame));
      return true;
    } catch {
      return false;
    }
  }

  function clearTimer(handle: unknown, interval = false): null {
    if (handle !== null) {
      if (interval) {
        timers.clearInterval(handle);
      } else {
        timers.clearTimeout(handle);
      }
    }
    return null;
  }

  function failPending(code: LocalErrorCode, includeQueued: boolean): void {
    for (const [id, entry] of [...pending]) {
      if (!entry.sent && !includeQueued) {
        continue;
      }
      pending.delete(id);
      entry.timer = clearTimer(entry.timer);
      entry.reject(new RequestError(code));
    }
  }

  function teardown(): void {
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    }
    socket = null;
    unansweredSince = null;
    pingTimer = clearTimer(pingTimer, true);
    helloTimer = clearTimer(helloTimer);
    helloRid = null;
  }

  // MARK: lifecycle

  function connect(): void {
    if (
      socket &&
      (socket.readyState === WS_OPEN || socket.readyState === WS_CONNECTING)
    ) {
      return;
    }
    manualClose = false;
    reconnectTimer = clearTimer(reconnectTimer);
    retryAt = 0;
    let opened: SocketLike;
    try {
      opened = makeSocket(options.url);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = opened;
    setStatus(attempt > 0 ? 'reconnecting' : 'connecting');
    opened.onopen = () => {
      if (opened === socket) {
        onOpen();
      }
    };
    opened.onmessage = (event) => {
      if (opened === socket) {
        onMessage(event.data);
      }
    };
    opened.onerror = () => {};
    opened.onclose = (event) => {
      if (opened === socket) {
        onClose(event.code);
      }
    };
  }

  function scheduleReconnect(): void {
    if (manualClose) {
      return;
    }
    const delay = backoffDelay(attempt, random);
    attempt += 1;
    retryAt = now() + delay;
    reconnectTimer = clearTimer(reconnectTimer);
    reconnectTimer = timers.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
    setStatus('reconnecting');
  }

  function onOpen(): void {
    unansweredSince = null;
    retryAt = 0;
    pingTimer = timers.setInterval(heartbeat, PING_INTERVAL_MS);
    if (name) {
      sendHello();
    } else {
      attempt = 0;
      setStatus('connected');
    }
  }

  function onClose(code: number): void {
    teardown();
    failPending('DISCONNECTED', false);
    if (manualClose) {
      setStatus('closed');
      return;
    }
    if (code === CLOSE_REPLACED) {
      manualClose = true;
      failPending('REPLACED', true);
      error = new RequestError('REPLACED');
      setStatus('closed');
      return;
    }
    if (code === CLOSE_HELLO_TIMEOUT && !name) {
      connect();
      return;
    }
    scheduleReconnect();
  }

  function heartbeat(): void {
    const at = now();
    if (unansweredSince !== null && at - unansweredSince > DEAD_AFTER_MS) {
      const dead = socket;
      teardown();
      dead?.close(4000, 'dead');
      failPending('DISCONNECTED', false);
      scheduleReconnect();
      return;
    }
    unansweredSince ??= at;
    sendRaw({ t: 'ping', c: at });
  }

  // MARK: handshake

  function sendHello(): void {
    if (!name) {
      return;
    }
    const id = nextRid();
    const frame: Record<string, unknown> = {
      ...(options.hello?.() ?? {}),
      t: 'hello',
      rid: id,
      name,
      version: PROTOCOL_VERSION,
    };
    const token = tokenOf();
    if (token) {
      frame.token = token;
    }
    helloRid = id;
    setStatus('handshaking');
    if (!sendRaw(frame)) {
      return;
    }
    helloTimer = clearTimer(helloTimer);
    helloTimer = timers.setTimeout(() => {
      helloTimer = null;
      if (status !== 'handshaking') {
        return;
      }
      const stale = socket;
      teardown();
      stale?.close(4000, 'hello timeout');
      failPending('DISCONNECTED', false);
      scheduleReconnect();
    }, HELLO_TIMEOUT_MS);
  }

  function onMessage(data: unknown): void {
    unansweredSince = null;
    let frame: Frame;
    try {
      frame = JSON.parse(String(data)) as Frame;
    } catch {
      return;
    }
    if (!frame || typeof frame !== 'object' || typeof frame.t !== 'string') {
      return;
    }
    if (frame.t === 'pong') {
      if (typeof frame.c === 'number') {
        ping = Math.max(0, now() - frame.c);
      }
    } else if (frame.t === 'welcome') {
      helloTimer = clearTimer(helloTimer);
      helloRid = null;
      welcome = frame;
      attempt = 0;
      error = null;
      setStatus('online');
      for (const entry of pending.values()) {
        if (!entry.sent) {
          entry.sent = sendRaw(entry.frame);
        }
      }
    } else if (
      frame.t === 'error' &&
      helloRid !== null &&
      frame.rid === helloRid
    ) {
      helloTimer = clearTimer(helloTimer);
      helloRid = null;
      error = new RequestError(
        String(frame.code ?? 'INTERNAL'),
        typeof frame.msg === 'string' ? frame.msg : null,
        frame.detail,
      );
      setStatus('connected');
      failPending('OFFLINE', true);
    } else if (typeof frame.rid === 'number' && pending.has(frame.rid)) {
      const entry = pending.get(frame.rid) as Pending;
      pending.delete(frame.rid);
      entry.timer = clearTimer(entry.timer);
      if (frame.t === 'error') {
        entry.reject(
          new RequestError(
            String(frame.code ?? 'INTERNAL'),
            typeof frame.msg === 'string' ? frame.msg : null,
            frame.detail,
          ),
        );
      } else {
        entry.resolve(frame);
      }
    }
    emit(frame);
  }

  // MARK: requests

  function request(
    type: string,
    fields: Readonly<Record<string, unknown>> = {},
  ): Promise<Frame> {
    return new Promise((resolve, reject) => {
      const id = nextRid();
      const frame = { ...fields, t: type, rid: id } as Frame;
      const bad = validateC2S(frame);
      if (bad) {
        reject(new RequestError('BAD_MSG', bad));
        return;
      }
      const establishing =
        status === 'connecting' ||
        status === 'handshaking' ||
        status === 'reconnecting';
      if (status !== 'online' && !(establishing && name && !manualClose)) {
        reject(new RequestError(manualClose ? 'CLOSED' : 'OFFLINE'));
        return;
      }
      const entry: Pending = {
        frame,
        resolve,
        reject,
        timer: null,
        sent: false,
      };
      entry.timer = timers.setTimeout(() => {
        if (pending.get(id) === entry) {
          pending.delete(id);
          reject(new RequestError('TIMEOUT'));
        }
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, entry);
      if (status === 'online') {
        entry.sent = sendRaw(frame);
      }
    });
  }

  function send(
    type: string,
    fields: Readonly<Record<string, unknown>> = {},
  ): boolean {
    const frame = { ...fields, t: type };
    if (validateC2S(frame) !== null || status !== 'online') {
      return false;
    }
    return sendRaw(frame);
  }

  return {
    snapshot,
    welcome: () => welcome,
    connect,
    close(): void {
      manualClose = true;
      reconnectTimer = clearTimer(reconnectTimer);
      retryAt = 0;
      const open = socket;
      teardown();
      open?.close(1000, 'client close');
      failPending('CLOSED', true);
      setStatus('closed');
    },
    retryNow(): void {
      if (manualClose && error?.code === 'REPLACED') {
        error = null;
        manualClose = false;
      }
      if (
        !manualClose &&
        !(
          socket &&
          (socket.readyState === WS_OPEN || socket.readyState === WS_CONNECTING)
        )
      ) {
        connect();
      }
    },
    setName(next: string): void {
      const trimmed = next.trim();
      if (!trimmed) {
        return;
      }
      name = trimmed;
      if (!socket || socket.readyState !== WS_OPEN) {
        if (!socket && reconnectTimer === null) {
          connect();
        }
        return;
      }
      sendHello();
    },
    request,
    send,
    on(type, listener) {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    onStatus(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
  };
}
