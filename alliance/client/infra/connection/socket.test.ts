import { describe, expect, it } from 'vitest';
import { backendOf } from './backend.js';
import {
  backoffDelay,
  CLOSE_REPLACED,
  createConnection,
  type Frame,
  type SocketFactory,
  type Timers,
} from './socket.js';

interface FakeSocket {
  readyState: number;
  sent: Frame[];
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { readonly code: number }) => void) | null;
  send(data: string): void;
  close(): void;
  open(): void;
  receive(frame: Frame): void;
  drop(code: number): void;
}

function fakeSockets(): { sockets: FakeSocket[]; factory: SocketFactory } {
  const sockets: FakeSocket[] = [];
  const factory: SocketFactory = () => {
    const socket: FakeSocket = {
      readyState: 0,
      sent: [],
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      send(data) {
        socket.sent.push(JSON.parse(data) as Frame);
      },
      close() {
        socket.readyState = 3;
      },
      open() {
        socket.readyState = 1;
        socket.onopen?.({});
      },
      receive(frame) {
        socket.onmessage?.({ data: JSON.stringify(frame) });
      },
      drop(code) {
        socket.readyState = 3;
        socket.onclose?.({ code });
      },
    };
    sockets.push(socket);
    return socket;
  };
  return { sockets, factory };
}

function fakeTimers(): Timers & { runFirst(): void; count(): number } {
  const queue = new Map<number, () => void>();
  let id = 0;
  return {
    setTimeout(callback) {
      id += 1;
      queue.set(id, callback);
      return id;
    },
    clearTimeout(handle) {
      queue.delete(handle as number);
    },
    setInterval() {
      id += 1;
      return id;
    },
    clearInterval() {},
    runFirst() {
      const [first] = queue;
      if (first) {
        queue.delete(first[0]);
        first[1]();
      }
    },
    count: () => queue.size,
  };
}

function setup() {
  const { sockets, factory } = fakeSockets();
  const timers = fakeTimers();
  const connection = createConnection({
    url: 'ws://test/ws',
    socket: factory,
    timers,
    random: () => 0.5,
    now: () => 1000,
    token: () => 'token-1',
  });
  return { sockets, timers, connection };
}

function ridOf(frame: { readonly rid?: number } | undefined): number {
  if (frame?.rid === undefined) {
    throw new Error('the frame was not sent as a request');
  }
  return frame.rid;
}

describe('connection', () => {
  it('sends hello with the name and token and goes online on welcome', () => {
    const { sockets, connection } = setup();
    connection.setName('rec');
    const socket = sockets[0] as FakeSocket;
    socket.open();
    expect(socket.sent[0]).toMatchObject({
      t: 'hello',
      name: 'rec',
      version: 1,
      token: 'token-1',
    });
    socket.receive({
      t: 'welcome',
      rid: ridOf(socket.sent[0]),
      playerId: 'p1',
    });
    expect(connection.snapshot().status).toBe('online');
    expect(backendOf(connection.welcome() as Frame).mode).toBe('compat');
  });

  it('resolves a request on its ok and rejects on its error', async () => {
    const { sockets, connection } = setup();
    connection.setName('rec');
    const socket = sockets[0] as FakeSocket;
    socket.open();
    socket.receive({ t: 'welcome' });
    const created = connection.request('room.create', {
      mode: 'solo',
      difficulty: 'FUNNY',
    });
    const join = connection.request('room.join', { code: 'ABCD' });
    const [first, second] = socket.sent.slice(-2);
    socket.receive({ t: 'ok', rid: ridOf(first) });
    socket.receive({
      t: 'error',
      rid: ridOf(second),
      code: 'ROOM_NOT_FOUND',
      msg: '未找到',
    });
    await expect(created).resolves.toMatchObject({ t: 'ok' });
    await expect(join).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' });
  });

  it('refuses an invalid frame before sending it', async () => {
    const { sockets, connection } = setup();
    connection.setName('rec');
    (sockets[0] as FakeSocket).open();
    (sockets[0] as FakeSocket).receive({ t: 'welcome' });
    await expect(
      connection.request('g.buy', { slot: -1 }),
    ).rejects.toMatchObject({ code: 'BAD_MSG' });
  });

  it('queues requests while reconnecting and flushes them after welcome', async () => {
    const { sockets, timers, connection } = setup();
    connection.setName('rec');
    (sockets[0] as FakeSocket).open();
    (sockets[0] as FakeSocket).receive({ t: 'welcome' });
    (sockets[0] as FakeSocket).drop(1006);
    expect(connection.snapshot().status).toBe('reconnecting');
    const ready = connection.request('room.ready', { ready: true });
    timers.runFirst();
    const next = sockets[1] as FakeSocket;
    next.open();
    next.receive({ t: 'welcome' });
    const sent = next.sent.find((frame) => frame.t === 'room.ready');
    expect(sent).toBeDefined();
    next.receive({ t: 'ok', rid: ridOf(sent) });
    await expect(ready).resolves.toMatchObject({ t: 'ok' });
  });

  it('stops reconnecting when the session is replaced', () => {
    const { sockets, timers, connection } = setup();
    connection.setName('rec');
    (sockets[0] as FakeSocket).open();
    (sockets[0] as FakeSocket).drop(CLOSE_REPLACED);
    expect(connection.snapshot()).toMatchObject({ status: 'closed' });
    expect(connection.snapshot().error?.code).toBe('REPLACED');
    expect(timers.count()).toBe(0);
  });

  it('grows the backoff and caps it', () => {
    expect(backoffDelay(0, () => 0.5)).toBe(500);
    expect(backoffDelay(3, () => 0.5)).toBe(4000);
    expect(backoffDelay(20, () => 0.5)).toBe(10000);
  });

  it('reads a welcome with ext as a native backend', () => {
    expect(backendOf({ t: 'welcome', ext: { protocol: 2 } }).mode).toBe(
      'native',
    );
  });
});
