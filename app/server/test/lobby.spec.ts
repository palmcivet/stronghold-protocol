// @ts-nocheck
import { describe, test, beforeAll, afterAll, afterEach } from "vitest"
import assert from "node:assert/strict"
import http from "node:http"
import { setTimeout as delay } from "node:timers/promises"
import { startServer } from "#server/entry/index.js"
import { loadData, DEFAULT_PACKET_DIR } from "#server/entry/packet.js"
import { CODE_ALPHABET, BOT_NAMES } from "#server/room/index.js"
import { StubMatch as Match } from "#server/test/stub.js"
import { Match as RealMatch } from "#server/match/flow/index.js"
import { TestClient } from "#server/test/client.js"
import { ERR, MAX_SEATS, MAX_SPECTATORS, PHASE, EMOTES } from "@alliance/contract/match.js"

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{4}$`)
const ROOT = DEFAULT_PACKET_DIR


// ---------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------

/** Raw HTTP request (the path is sent verbatim, no normalization). */
function httpReq(port, rawPath, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

/** Tracks clients per test so they are always closed. */
function clientPool(getUrl) {
  const open = new Set();
  return {
    async connect(opts) {
      const c = await TestClient.connect(getUrl(), opts);
      open.add(c);
      return c;
    },
    /** Connect + hello; the client gets `.id` and `.token`. */
    async player(name, token) {
      const c = await this.connect();
      const w = await c.hello(name, token);
      c.id = w.playerId;
      c.token = w.token;
      c.welcome = w;
      return c;
    },
    async closeAll() {
      await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
      open.clear();
    },
  };
}

async function createRoom(c, mode = 'coop', difficulty = 'NORMAL') {
  const r = await c.request({ t: 'room.create', mode, difficulty });
  assert.equal(r.t, 'ok', JSON.stringify(r));
  return c.waitFor('room.state', (s) => s.hostId === c.id && s.mode === mode);
}

async function joinRoom(c, code) {
  const r = await c.request({ t: 'room.join', code });
  assert.equal(r.t, 'ok', JSON.stringify(r));
  return c.waitFor('room.state', (s) => s.code === code.toUpperCase() && s.seats.some((x) => x && x.playerId === c.id));
}

const seatOf = (state, id) => state.seats.find((s) => s && s.playerId === id) || null;
const expectError = async (c, msg, code) => {
  const r = await c.request(msg);
  assert.equal(r.t, 'error', `expected error ${code} for ${msg.t}, got ${JSON.stringify(r)}`);
  assert.equal(r.code, code, `${msg.t}: ${JSON.stringify(r)}`);
  assert.equal(typeof r.msg, 'string');
  return r;
};
const expectOk = async (c, msg) => {
  const r = await c.request(msg);
  assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`);
  return r;
};

/** Collects log output; errors are asserted empty unless a test expects them. */
function captureLog() {
  const errors = [];
  return { errors, log: { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) } };
}
// ---------------------------------------------------------------------------------------------------
// WebSocket session layer + lobby (default timers)
// ---------------------------------------------------------------------------------------------------

describe('websocket lobby', () => {
  let srv;
  let pool;
  const cap = captureLog();

  beforeAll(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: Match });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  afterEach(async () => { await pool.closeAll(); });
  afterAll(async () => {
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  test('hello → welcome with playerId, 128-bit token, sanitized name; ping → pong', async () => {
    const c = await pool.connect();
    const w = await c.hello(' 博士  Doctor ');
    assert.equal(w.t, 'welcome');
    assert.match(w.playerId, /^p_[0-9a-f]{10}$/);
    assert.match(w.token, /^[0-9a-f]{32}$/);
    assert.equal(w.name, '博士 Doctor');
    assert.equal(w.resumed, false);
    assert.ok(Math.abs(w.serverNow - Date.now()) < 5000);
    const pong = await c.request({ t: 'ping', c: 12.5 });
    assert.equal(pong.t, 'pong');
    assert.equal(pong.c, 12.5);
    assert.equal(typeof pong.s, 'number');

    const other = await pool.player('Other');
    assert.notEqual(other.id, w.playerId);
    assert.notEqual(other.token, w.token);

    await expectError(c, { t: 'hello', name: '   ' }, ERR.BAD_MSG);
    await expectError(c, { t: 'hello', name: 'x', version: 999 }, ERR.BAD_MSG);
    await expectError(c, { t: 'hello', name: 'x'.repeat(13) }, ERR.BAD_MSG);
    // repeated hello updates the name, keeps identity
    const again = await c.hello('Renamed');
    assert.equal(again.playerId, w.playerId);
    assert.equal(again.name, 'Renamed');
  });

  test('bad messages → BAD_MSG and the connection stays alive', async () => {
    const c = await pool.connect();
    await expectError(c, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' }, ERR.BAD_MSG); // before hello
    c.id = (await c.hello('Fuzzer')).playerId;
    c.sendRaw('{not json');
    let e = await c.waitFor('error');
    assert.equal(e.code, ERR.BAD_MSG);
    assert.equal(e.rid, undefined);
    c.sendRaw(Buffer.from([1, 2, 3]), { binary: true });
    e = await c.waitFor('error');
    assert.equal(e.code, ERR.BAD_MSG);
    for (const raw of ['[1,2]', 'null', '42', '"str"', '{}', '{"t":5}']) {
      c.sendRaw(raw);
      e = await c.waitFor('error');
      assert.equal(e.code, ERR.BAD_MSG, raw);
    }
    for (const t of ['nope', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'g.', 'room.']) {
      const r = await expectError(c, { t }, ERR.BAD_MSG);
      assert.ok(Number.isInteger(r.rid), 'rid echoed');
    }
    await expectError(c, { t: 'room.create', mode: 'pvp', difficulty: 'NORMAL' }, ERR.BAD_MSG);
    await expectError(c, { t: 'room.create', mode: 'coop', difficulty: 'EASY' }, ERR.BAD_MSG);
    await expectError(c, { t: 'room.create', mode: 'coop' }, ERR.BAD_MSG);
    await expectError(c, { t: 'room.join', code: 'AB CD' }, ERR.BAD_MSG);
    await expectError(c, { t: 'room.join', code: { $gt: '' } }, ERR.BAD_MSG);
    await expectError(c, { t: 'room.ready', ready: 'yes' }, ERR.BAD_MSG);
    await expectError(c, { t: 'room.removeBot', seat: 9 }, ERR.BAD_MSG);
    await expectError(c, { t: 'g.buy', slot: -1 }, ERR.BAD_MSG);
    await expectError(c, { t: 'g.move', uid: 1, to: { area: 'moon' } }, ERR.BAD_MSG);
    await expectError(c, { t: 'ping', c: 'x' }, ERR.BAD_MSG);
    c.send({ t: 'ping', c: 1, rid: -5 });
    e = await c.waitFor('error');
    assert.equal(e.code, ERR.BAD_MSG);
    assert.equal(e.rid, undefined, 'invalid rid is not echoed');
    // still alive and functional
    assert.ok(c.isOpen);
    const pong = await c.request({ t: 'ping', c: 1 });
    assert.equal(pong.t, 'pong');
    await createRoom(c);
  });

  test('oversized frame (> 64 KB) closes only that socket', async () => {
    const c = await pool.player('Big');
    const bystander = await pool.player('Bystander');
    c.sendRaw(JSON.stringify({ t: 'ping', c: 1, pad: 'x'.repeat(70 * 1024) }));
    const info = await c.closed;
    assert.equal(info.code, 1009);
    const pong = await bystander.request({ t: 'ping', c: 2 });
    assert.equal(pong.t, 'pong');
  });

  test('rate limit: bursts beyond 40 msg/s get RATE, connection survives, bucket refills', async () => {
    const c = await pool.player('Spammer');
    const N = 100;
    const rids = [];
    for (let i = 0; i < N; i++) rids.push(c.send({ t: 'ping', c: i }));
    const replies = [];
    for (const rid of rids) replies.push(await c.waitFor(null, (m) => m.rid === rid, 3000));
    const pongs = replies.filter((m) => m.t === 'pong').length;
    const limited = replies.filter((m) => m.t === 'error' && m.code === ERR.RATE).length;
    assert.equal(pongs + limited, N);
    assert.ok(pongs >= 39 && pongs <= 45, `pongs ${pongs}`); // hello used one token
    assert.ok(limited >= 55, `limited ${limited}`);
    assert.ok(c.isOpen);
    await delay(1100);
    const ok = await c.request({ t: 'ping', c: 0 });
    assert.equal(ok.t, 'pong');
  });

  test('flooding far beyond the limit closes the socket (1008)', async () => {
    const c = await pool.player('Flood');
    for (let i = 0; i < 600; i++) c.send({ t: 'ping', c: i, rid: null });
    const info = await c.closed;
    assert.equal(info.code, 1008);
  });

  test('create / join / leave', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host, 'coop', 'HARD');
    assert.match(st.code, CODE_RE);
    assert.equal(st.mode, 'coop');
    assert.equal(st.difficulty, 'HARD');
    assert.equal(st.inMatch, false);
    assert.equal(st.seats.length, MAX_SEATS);
    assert.deepEqual(st.seats[0], { seat: 0, playerId: host.id, name: 'Host', isBot: false, ready: false, connected: true });
    assert.deepEqual(st.seats.slice(1), [null, null, null]);

    const guest = await pool.player('Guest');
    const joined = await joinRoom(guest, st.code.toLowerCase());
    assert.equal(joined.hostId, host.id);
    assert.equal(seatOf(joined, guest.id).seat, 1);
    const hostView = await host.waitFor('room.state', (s) => !!seatOf(s, guest.id));
    assert.equal(hostView.seats[1].name, 'Guest');

    // join is idempotent for members
    await expectOk(guest, { t: 'room.join', code: st.code });
    await guest.waitFor('room.state', (s) => s.code === st.code);

    await expectOk(guest, { t: 'room.ready', ready: true });
    const readyView = await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.ready === true);
    assert.ok(readyView);

    await expectOk(guest, { t: 'room.leave' });
    const afterLeave = await host.waitFor('room.state', (s) => s.seats[1] === null);
    assert.equal(afterLeave.hostId, host.id);
    await expectError(guest, { t: 'room.leave' }, ERR.NOT_IN_ROOM);
    await expectError(guest, { t: 'room.ready', ready: true }, ERR.NOT_IN_ROOM);
    await expectError(guest, { t: 'g.ready', ready: true }, ERR.NOT_IN_ROOM);

    await expectError(guest, { t: 'room.join', code: 'ZZZZ' === st.code ? 'YYYY' : 'ZZZZ' }, ERR.ROOM_NOT_FOUND);
    await expectError(guest, { t: 'room.join', code: 'ABC' }, ERR.ROOM_NOT_FOUND);
    await expectError(guest, { t: 'room.join', code: 'ABCDEF' }, ERR.ROOM_NOT_FOUND);

    // creating a room while in another lobby room moves you
    const g2 = await joinRoom(guest, st.code);
    assert.equal(seatOf(g2, guest.id).seat, 1);
    const own = await createRoom(guest);
    assert.notEqual(own.code, st.code);
    await host.waitFor('room.state', (s) => s.seats[1] === null);

    // last human leaving disposes the room
    await expectOk(guest, { t: 'room.leave' });
    await expectError(host, { t: 'room.join', code: own.code }, ERR.ROOM_NOT_FOUND);
  });

  test('room full, solo rooms admit one human and no AI', async () => {
    const host = await pool.player('H');
    const st = await createRoom(host);
    const guests = [];
    for (let i = 0; i < 2; i++) {
      const g = await pool.player(`G${i}`);
      await joinRoom(g, st.code);
      guests.push(g);
    }
    await expectOk(host, { t: 'room.addBot' });
    await host.waitFor('room.state', (s) => s.seats.every(Boolean));
    const late = await pool.player('Late');
    await expectError(late, { t: 'room.join', code: st.code }, ERR.ROOM_FULL);
    await expectError(host, { t: 'room.addBot' }, ERR.ROOM_FULL);

    const solo = await pool.player('Solo');
    const soloState = await createRoom(solo, 'solo', 'FUNNY');
    assert.equal(soloState.mode, 'solo');
    await expectError(late, { t: 'room.join', code: soloState.code }, ERR.ROOM_FULL);
    await expectError(solo, { t: 'room.addBot' }, ERR.ROOM_FULL);
  });

  // community report #26 (a remake feature): spectator seats — server/lobby.js header
  test('spectator seats: join / cap / leave / host removal; never a player, never acting, never keeping a room', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    assert.deepEqual(st.spectators, []);
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    const s1 = await pool.player('Watcher1');
    await expectOk(s1, { t: 'room.spectate', code: st.code.toLowerCase() });
    const v1 = await s1.waitFor('room.state', (s) => s.spectators.some((x) => x.playerId === s1.id));
    assert.deepEqual(v1.spectators, [{ playerId: s1.id, name: 'Watcher1', connected: true }]);
    assert.ok(!v1.seats.some((x) => x && x.playerId === s1.id), 'never in a player seat');
    await host.waitFor('room.state', (s) => s.spectators.length === 1);
    await expectOk(s1, { t: 'room.spectate', code: st.code }); // idempotent
    await expectError(guest, { t: 'room.spectate', code: st.code }, ERR.ALREADY); // a player never switches in place
    // a spectator may not act
    await expectError(s1, { t: 'room.ready', ready: true }, ERR.SPECTATOR);
    for (const msg of [{ t: 'room.start' }, { t: 'room.addBot' }, { t: 'room.setDifficulty', difficulty: 'HARD' }, { t: 'room.removeSpectator', playerId: s1.id }]) {
      await expectError(s1, msg, ERR.NOT_HOST);
    }
    await expectError(s1, { t: 'g.ready', ready: true }, ERR.WRONG_PHASE);
    // the cap; spectators never count toward the players: two player seats still free
    const s2 = await pool.player('Watcher2');
    await expectOk(s2, { t: 'room.spectate', code: st.code });
    assert.equal(MAX_SPECTATORS, 2);
    const s3 = await pool.player('Watcher3');
    await expectError(s3, { t: 'room.spectate', code: st.code }, ERR.ROOM_FULL);
    await joinRoom(s3, st.code);
    await expectOk(host, { t: 'room.addBot' });
    const full = await host.waitFor('room.state', (s) => s.seats.every(Boolean));
    assert.equal(full.spectators.length, 2);
    await expectOk(s3, { t: 'room.ready', ready: true });
    await expectOk(guest, { t: 'room.ready', ready: true });
    // a spectator in the lobby takes a free player seat with room.join of the same code
    await expectError(s2, { t: 'room.join', code: st.code }, ERR.ROOM_FULL);
    await expectOk(host, { t: 'room.removeBot', seat: 3 });
    const sat = await joinRoom(s2, st.code);
    assert.equal(seatOf(sat, s2.id).seat, 3);
    assert.deepEqual(sat.spectators.map((x) => x.playerId), [s1.id]);
    // leave
    host.clearInbox();
    await expectOk(s1, { t: 'room.leave' });
    await host.waitFor('room.state', (s) => s.spectators.length === 0);
    await expectError(s1, { t: 'room.leave' }, ERR.NOT_IN_ROOM);
    await expectError(s1, { t: 'room.ready', ready: true }, ERR.NOT_IN_ROOM);
    // host removal: room.closed {kicked}
    const s4 = await pool.player('Watcher4');
    await expectOk(s4, { t: 'room.spectate', code: st.code });
    await host.waitFor('room.state', (s) => s.spectators.length === 1);
    await expectError(host, { t: 'room.removeSpectator', playerId: guest.id }, ERR.BAD_TARGET);
    await expectError(guest, { t: 'room.removeSpectator', playerId: s4.id }, ERR.NOT_HOST);
    await expectOk(host, { t: 'room.removeSpectator', playerId: s4.id });
    assert.equal((await s4.waitFor('room.closed')).reason, 'kicked');
    await host.waitFor('room.state', (s) => s.spectators.length === 0);
    await expectError(s4, { t: 'room.leave' }, ERR.NOT_IN_ROOM);
    // an offline spectator removed: freed at once, told on its next resume
    const s5 = await pool.player('Watcher5');
    await expectOk(s5, { t: 'room.spectate', code: st.code });
    await s5.terminate();
    await host.waitFor('room.state', (s) => s.spectators.find((x) => x.playerId === s5.id)?.connected === false);
    await expectOk(host, { t: 'room.removeSpectator', playerId: s5.id });
    const s5back = await pool.connect();
    await s5back.hello('Watcher5', s5.token);
    assert.equal((await s5back.waitFor('room.closed')).reason, 'kicked');
    await s5back.expectNone('room.state');
    // solo rooms have no spectator seat; unknown codes
    const solo = await pool.player('Solo');
    const soloSt = await createRoom(solo, 'solo', 'FUNNY');
    await expectError(s4, { t: 'room.spectate', code: soloSt.code }, ERR.ROOM_FULL);
    await expectError(s4, { t: 'room.spectate', code: st.code === 'ZZZZ' ? 'YYYY' : 'ZZZZ' }, ERR.ROOM_NOT_FOUND);
    // a spectator never keeps a room alive: its last human leaving closes it for the spectator
    const lone = await pool.player('Lone');
    const loneSt = await createRoom(lone);
    await expectOk(s4, { t: 'room.spectate', code: loneSt.code });
    await lone.waitFor('room.state', (s) => s.spectators.length === 1);
    await expectOk(lone, { t: 'room.leave' });
    assert.equal((await s4.waitFor('room.closed')).reason, 'empty');
    await expectError(s4, { t: 'room.spectate', code: loneSt.code }, ERR.ROOM_NOT_FOUND);
  });

  test('spectators during a match: broadcasts but no private view, join mid-match, only watching, reconnect gets the seat back', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const spec = await pool.player('Spec');
    await expectOk(spec, { t: 'room.spectate', code: st.code });
    await expectOk(host, { t: 'room.start' }); // the spectator is no player to wait for
    const pub = await spec.waitFor('m.public');
    assert.deepEqual(pub.players.map((p) => p.playerId), [host.id], 'never one of the match\'s players');
    const late = await pool.player('Late');
    await expectError(late, { t: 'room.join', code: st.code }, ERR.ROOM_STARTED);
    await expectOk(late, { t: 'room.spectate', code: st.code }); // a running match: a spectator seat is still free
    const lateState = await late.waitFor('room.state', (s) => s.inMatch);
    assert.deepEqual(lateState.spectators.map((x) => x.playerId), [spec.id, late.id]);
    for (const msg of [{ t: 'g.infoReady' }, { t: 'g.buy', slot: 0 }, { t: 'g.ready', ready: true }, { t: 'g.emote', id: EMOTES[0] }, { t: 'g.autoplay', on: true }]) {
      await expectError(spec, msg, ERR.SPECTATOR);
    }
    await expectOk(spec, { t: 'room.loadout', entries: {} }); // kept for its session, never handed to the match
    // drop and resume with the token: the seat is kept meanwhile and given back
    await late.terminate();
    await host.waitFor('room.state', (s) => s.spectators.find((x) => x.playerId === late.id)?.connected === false);
    const back = await pool.connect();
    const w = await back.hello('Late', late.token);
    assert.equal(w.resumed, true);
    const rs = await back.waitFor('room.state');
    assert.deepEqual(rs.spectators.find((x) => x.playerId === late.id), { playerId: late.id, name: 'Late', connected: true });
    await expectError(back, { t: 'g.infoReady' }, ERR.SPECTATOR);
    // the match ends: the spectators see the result (a broadcast) and stay in the room, which returns to its lobby
    await expectOk(host, { t: 'g.infoReady' });
    await spec.waitFor('m.result');
    const lobby = await spec.waitFor('room.state', (s) => !s.inMatch && s.spectators.length === 2);
    assert.deepEqual(lobby.spectators.map((x) => x.playerId), [spec.id, late.id]);
    assert.equal(spec.log.filter((x) => x.t === 'm.private').length, 0, 'no private view, ever');
    assert.equal(back.log.filter((x) => x.t === 'm.private').length, 0);
  });

  test('host-only commands, difficulty change un-readies guests, host transfer on leave', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host, 'coop', 'NORMAL');
    const a = await pool.player('A');
    const b = await pool.player('B');
    await joinRoom(a, st.code);
    await joinRoom(b, st.code);
    for (const msg of [{ t: 'room.setDifficulty', difficulty: 'HARD' }, { t: 'room.addBot' }, { t: 'room.removeBot', seat: 0 }, { t: 'room.start' }]) {
      await expectError(a, msg, ERR.NOT_HOST);
    }
    await expectOk(a, { t: 'room.ready', ready: true });
    await host.waitFor('room.state', (s) => seatOf(s, a.id)?.ready);
    await expectOk(host, { t: 'room.setDifficulty', difficulty: 'ABYSS' });
    const changed = await a.waitFor('room.state', (s) => s.difficulty === 'ABYSS');
    assert.equal(seatOf(changed, a.id).ready, false, 'difficulty change resets ready');

    await expectOk(host, { t: 'room.leave' });
    const transferred = await a.waitFor('room.state', (s) => s.hostId !== host.id);
    assert.equal(transferred.hostId, a.id, 'lowest remaining seat becomes host');
    assert.equal(transferred.seats[0], null);
    await b.waitFor('room.state', (s) => s.hostId === a.id);

    // new joiner takes the lowest free seat (0); host stays with A
    const c = await pool.player('C');
    const joined = await joinRoom(c, st.code);
    assert.equal(seatOf(joined, c.id).seat, 0);
    assert.equal(joined.hostId, a.id);
    await expectOk(a, { t: 'room.addBot' });
    const withBot = await c.waitFor('room.state', (s) => s.seats[3]?.isBot);
    assert.equal(withBot.hostId, a.id);
    await expectError(b, { t: 'room.addBot' }, ERR.NOT_HOST);
    await expectError(host, { t: 'room.addBot' }, ERR.NOT_IN_ROOM);
  });

  test('add / remove AI; a room with only AI is disposed', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    await expectOk(host, { t: 'room.addBot' });
    const s1 = await host.waitFor('room.state', (s) => s.seats[1]?.isBot);
    assert.equal(s1.seats[1].ready, true);
    assert.equal(s1.seats[1].connected, true);
    assert.equal(s1.seats[1].name, BOT_NAMES[0]);
    assert.match(s1.seats[1].playerId, /^ai_[0-9a-f]{8}$/);
    await expectOk(host, { t: 'room.addBot' });
    const s2 = await host.waitFor('room.state', (s) => s.seats[2]?.isBot);
    assert.equal(s2.seats[2].name, BOT_NAMES[1]);

    await expectError(host, { t: 'room.removeBot', seat: 0 }, ERR.BAD_TARGET); // human seat
    await expectError(host, { t: 'room.removeBot', seat: 3 }, ERR.BAD_TARGET); // empty seat
    await expectOk(host, { t: 'room.removeBot', seat: 1 });
    const s3 = await host.waitFor('room.state', (s) => s.seats[1] === null && s.seats[2]?.isBot);
    assert.ok(s3);
    await expectOk(host, { t: 'room.addBot' });
    const s4 = await host.waitFor('room.state', (s) => s.seats[1]?.isBot);
    assert.equal(s4.seats[1].name, BOT_NAMES[0], 'freed bot name is reused');

    await expectOk(host, { t: 'room.leave' });
    const probe = await pool.player('Probe');
    await expectError(probe, { t: 'room.join', code: st.code }, ERR.ROOM_NOT_FOUND);
  });

  test('start flow: readiness gate → stub INFO_CHECK → end → back to LOBBY → play again', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host, 'coop', 'HARD');
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await expectOk(host, { t: 'room.addBot' });
    await expectError(host, { t: 'g.infoReady' }, ERR.WRONG_PHASE); // no match yet
    await expectError(guest, { t: 'room.start' }, ERR.NOT_HOST);
    await expectError(host, { t: 'room.start' }, ERR.NOT_READY);
    await expectOk(guest, { t: 'room.ready', ready: true });

    await expectOk(host, { t: 'room.start' });
    const inMatch = await guest.waitFor('room.state', (s) => s.inMatch);
    assert.equal(inMatch.code, st.code);
    for (const c of [host, guest]) {
      const pub = await c.waitFor('m.public');
      assert.equal(pub.phase, 'INFO_CHECK');
      assert.equal(pub.modeId, 'mode_multi_hard');
      assert.equal(typeof pub.message, 'string');
      assert.ok(pub.deadline > pub.serverNow);
      assert.equal(pub.players.length, 3);
      assert.equal(pub.players.filter((p) => p.isBot).length, 1);
      const priv = await c.waitFor('m.private');
      assert.equal(priv.playerId, c.id);
    }

    // match intents route to the match; lobby intents are refused
    await expectOk(guest, { t: 'g.buy', slot: 0 });
    await expectOk(guest, { t: 'g.emote', id: 'autochess_battle_happy' });
    const emote = await host.waitFor('m.emote');
    assert.deepEqual([emote.playerId, emote.id], [guest.id, 'autochess_battle_happy']);
    await expectError(guest, { t: 'room.ready', ready: false }, ERR.ROOM_STARTED);
    await expectError(host, { t: 'room.start' }, ERR.ROOM_STARTED);
    await expectError(host, { t: 'room.addBot' }, ERR.ROOM_STARTED);
    await expectError(host, { t: 'room.setDifficulty', difficulty: 'FUNNY' }, ERR.ROOM_STARTED);
    await expectError(host, { t: 'room.create', mode: 'coop', difficulty: 'FUNNY' }, ERR.ROOM_STARTED);
    const outsider = await pool.player('Outsider');
    await expectError(outsider, { t: 'room.join', code: st.code }, ERR.ROOM_STARTED);
    await expectError(outsider, { t: 'g.buy', slot: 0 }, ERR.NOT_IN_ROOM);
    const other = await createRoom(outsider);
    await expectError(host, { t: 'room.join', code: other.code }, ERR.ROOM_STARTED);

    // stub ends once every human confirmed the briefing
    host.clearInbox();
    await expectOk(host, { t: 'g.infoReady' });
    await expectOk(guest, { t: 'g.infoReady' });
    const result = await host.waitFor('m.result');
    assert.equal(result.stub, true);
    const back = await host.waitFor('room.state', (s) => !s.inMatch);
    assert.equal(back.hostId, host.id);
    assert.equal(seatOf(back, guest.id).ready, false, 'humans un-ready after a match');
    assert.equal(back.seats.filter((s) => s?.isBot).length, 1, 'bots stay');
    await expectError(guest, { t: 'g.infoReady' }, ERR.WRONG_PHASE);

    // play again
    await expectOk(guest, { t: 'room.ready', ready: true });
    guest.clearInbox();
    await expectOk(host, { t: 'room.start' });
    const again = await guest.waitFor('m.public', (m) => m.phase === 'INFO_CHECK');
    assert.ok(again.players.every((p) => p.isBot || !p.ready), 'fresh match state');
  });

  test('solo room: host starts alone', async () => {
    const solo = await pool.player('Solo');
    await createRoom(solo, 'solo', 'FUNNY');
    await expectOk(solo, { t: 'room.start' });
    const pub = await solo.waitFor('m.public');
    assert.equal(pub.phase, 'INFO_CHECK');
    assert.equal(pub.modeId, 'mode_single_funny');
    assert.equal(pub.lastRound, 9);
    await expectOk(solo, { t: 'g.infoReady' });
    await solo.waitFor('m.result');
    await solo.waitFor('room.state', (s) => !s.inMatch && s.mode === 'solo');
  });

  test('reconnect with token in LOBBY restores the seat', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await expectOk(guest, { t: 'room.ready', ready: true });
    await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.ready);
    await guest.terminate();
    const dropped = await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.connected === false);
    assert.equal(seatOf(dropped, guest.id).seat, 1);
    await expectError(host, { t: 'room.start' }, ERR.NOT_READY); // disconnected humans block the start

    host.clearInbox();
    const back = await pool.connect();
    const w = await back.hello('Guest2', guest.token);
    assert.equal(w.resumed, true);
    assert.equal(w.playerId, guest.id);
    assert.equal(w.token, guest.token);
    const restored = await back.waitFor('room.state');
    assert.equal(restored.code, st.code);
    assert.deepEqual(seatOf(restored, guest.id), { seat: 1, playerId: guest.id, name: 'Guest2', isBot: false, ready: true, connected: true });
    await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.connected === true);

    // an unknown token just creates a new identity
    const stranger = await pool.connect();
    const sw = await stranger.hello('Stranger', 'f'.repeat(32));
    assert.equal(sw.resumed, false);
    assert.notEqual(sw.playerId, guest.id);
  });

  test('reconnect with token during a match restores seat and resends match state', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await expectOk(guest, { t: 'room.ready', ready: true });
    await expectOk(host, { t: 'room.start' });
    await guest.waitFor('m.public');
    await host.waitFor('m.public');

    await guest.terminate();
    await host.waitFor('room.state', (s) => s.inMatch && seatOf(s, guest.id)?.connected === false);
    const pubDrop = await host.waitFor('m.public', (m) => m.players.some((p) => p.playerId === guest.id && !p.connected));
    assert.ok(pubDrop);

    const back = await pool.connect();
    const w = await back.hello('Guest', guest.token);
    assert.equal(w.resumed, true);
    assert.equal(w.playerId, guest.id);
    const rs = await back.waitFor('room.state');
    assert.equal(rs.inMatch, true);
    assert.equal(seatOf(rs, guest.id).connected, true);
    const pub = await back.waitFor('m.public');
    assert.equal(pub.phase, 'INFO_CHECK');
    const priv = await back.waitFor('m.private');
    assert.equal(priv.playerId, guest.id);
    await expectOk(back, { t: 'g.refresh' });
  });

  test('same token on a second socket replaces the first (close 4001)', async () => {
    const a = await pool.player('Twin');
    const st = await createRoom(a);
    const b = await pool.connect();
    const w = await b.hello('Twin', a.token);
    assert.equal(w.resumed, true);
    const info = await a.closed;
    assert.equal(info.code, 4001);
    const rs = await b.waitFor('room.state');
    assert.equal(rs.code, st.code);
    assert.equal(seatOf(rs, a.id).connected, true, 'old socket closing does not mark the session disconnected');
    await delay(50);
    await expectOk(b, { t: 'room.ready', ready: true });
    const ready = await b.waitFor('room.state', (s) => seatOf(s, a.id)?.ready);
    assert.equal(seatOf(ready, a.id).connected, true);
  });

  test('g.leave / room.leave during a match departs permanently; seat freed when the match ends', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await expectOk(guest, { t: 'room.ready', ready: true });
    await expectOk(host, { t: 'room.start' });
    await guest.waitFor('m.public');
    await expectOk(guest, { t: 'g.leave' });
    const st2 = await host.waitFor('room.state', (s) => s.inMatch && seatOf(s, guest.id)?.connected === false);
    assert.equal(seatOf(st2, guest.id).seat, 1, 'seat kept during the match');
    await expectError(guest, { t: 'g.infoReady' }, ERR.NOT_IN_ROOM);
    await expectError(guest, { t: 'room.join', code: st.code }, ERR.ROOM_STARTED);
    // the departed player is free to do other things
    await createRoom(guest);
    // host finishes; stub counts departed players as ready
    host.clearInbox();
    await expectOk(host, { t: 'g.infoReady' });
    const back = await host.waitFor('room.state', (s) => !s.inMatch);
    assert.equal(seatOf(back, guest.id), null, 'departed seat freed');

    // host leaving a running match with nobody else disposes the room
    host.clearInbox();
    await expectOk(host, { t: 'room.start' });
    await host.waitFor('m.public', (m) => m.phase === 'INFO_CHECK');
    await expectOk(host, { t: 'room.leave' });
    const probe = await pool.player('Probe');
    await expectError(probe, { t: 'room.join', code: st.code }, ERR.ROOM_NOT_FOUND);
  });

  test('protocol fuzz: random intents never crash the server or corrupt lobby invariants', async () => {
    let seed = 0x5eed1234;
    const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const clients = [];
    for (let i = 0; i < 5; i++) clients.push(await pool.player(`F${i}`));
    const codes = () => [...srv.lobby.rooms.keys()];
    const gTypes = ['g.infoReady', 'g.band', 'g.bandSkip', 'g.buy', 'g.refresh', 'g.freeze', 'g.levelUp', 'g.sell', 'g.move', 'g.equip', 'g.art', 'g.destroy', 'g.reward', 'g.choice', 'g.ready', 'g.emote', 'g.watch', 'g.autoplay', 'g.leave'];
    const junk = [1, -1, 1.5, 'x', '', null, true, [], {}, { area: 'board', row: 1, col: 1 }, 'A'.repeat(70), 2 ** 40];
    const gen = () => {
      const r = rnd();
      if (r < 0.12) return { t: 'room.create', mode: pick(['solo', 'coop', 'coop', 'x']), difficulty: pick(['FUNNY', 'NORMAL', 'HARD', 'ABYSS', 'nope']) };
      if (r < 0.25) return { t: 'room.join', code: pick([...codes(), 'ZZZZ', 'abc', ...codes().map((c) => c.toLowerCase())]) || 'QQQQ' };
      if (r < 0.32) return { t: 'room.leave' };
      if (r < 0.42) return { t: 'room.ready', ready: pick([true, false, 'x']) };
      if (r < 0.47) return { t: 'room.setDifficulty', difficulty: pick(['FUNNY', 'ABYSS', 1]) };
      if (r < 0.55) return { t: 'room.addBot' };
      if (r < 0.60) return { t: 'room.removeBot', seat: pick([0, 1, 2, 3, 4, -1, 'x']) };
      if (r < 0.68) return { t: 'room.start' };
      if (r < 0.90) {
        const m = { t: pick(gTypes) };
        for (const k of ['bandId', 'slot', 'uid', 'to', 'itemUid', 'targetUid', 'row', 'col', 'idx', 'ready', 'id', 'fieldId', 'on']) if (rnd() < 0.3) m[k] = pick(junk);
        if (m.t === 'g.emote' && rnd() < 0.5) m.id = 'autochess_battle_happy';
        return m;
      }
      // spectator seats (community report #26)
      if (r < 0.95) {
        return rnd() < 0.7
          ? { t: 'room.spectate', code: pick([...codes(), 'ZZZZ', ...codes().map((c) => c.toLowerCase())]) || 'QQQQ' }
          : { t: 'room.removeSpectator', playerId: pick([...clients.map((x) => x.id), 'p_nope', 1]) };
      }
      return pick([{ t: 'hello', name: pick(['Re', '', 'x'.repeat(20)]) }, { t: 'ping', c: pick([1, 'x']) }, { t: pick(['nope', '__proto__', 'toString']) }, { t: 'room.join', code: pick(junk) }]);
    };
    const okCounts = {};
    for (let i = 0; i < 500; i++) {
      const k = Math.floor(rnd() * clients.length);
      let c = clients[k];
      if (rnd() < 0.04) { // drop & resume
        await c.terminate();
        const back = await pool.connect();
        const w = await back.hello(`F${k}`, c.token);
        Object.assign(back, { id: w.playerId, token: w.token });
        clients[k] = c = back;
        continue;
      }
      const msg = gen();
      const reply = await c.request(msg, 3000);
      assert.ok(['ok', 'error', 'welcome', 'pong'].includes(reply.t));
      if (reply.t === 'ok') okCounts[msg.t] = (okCounts[msg.t] || 0) + 1;
      if (reply.t === 'error') assert.ok(Object.hasOwn(ERR, reply.code), reply.code);
      if (i % 50 === 0) await delay(30); // stay well under the rate limit
    }
    for (const t of ['room.create', 'room.join', 'room.start', 'room.addBot', 'g.infoReady']) assert.ok(okCounts[t] > 0, `fuzz never succeeded at ${t}`);
    // invariants
    const seen = new Set();
    for (const room of srv.lobby.rooms.values()) {
      const humans = room.activeHumans();
      assert.ok(humans.length >= 1, `room ${room.code} has no humans`);
      assert.ok(humans.some((h) => h.playerId === room.hostId), `room ${room.code} host is not an active human`);
      if (room.mode === 'solo') assert.ok(room.seats.filter(Boolean).length === 1);
      room.seats.forEach((s, i) => { if (s) assert.equal(s.seat, i); });
      for (const h of humans) {
        assert.ok(!seen.has(h.playerId), 'player seated twice');
        seen.add(h.playerId);
        const sess = srv.registry.byId(h.playerId);
        assert.ok(sess, 'seated session exists');
        assert.equal(sess.roomCode, room.code);
      }
      // spectator seats: capped, none in solo rooms, never also a player (here or elsewhere), never the host
      assert.ok(room.spectators.length <= MAX_SPECTATORS, `room ${room.code} spectator cap`);
      if (room.mode === 'solo') assert.equal(room.spectators.length, 0, 'no spectator seat in a solo room');
      for (const sp of room.spectators) {
        assert.ok(!seen.has(sp.playerId), 'a spectator is seated (or spectating) twice');
        seen.add(sp.playerId);
        assert.ok(!room.seatOf(sp.playerId) && room.hostId !== sp.playerId);
        assert.equal(srv.registry.byId(sp.playerId)?.roomCode, room.code, 'the spectator\'s session points at its room');
      }
    }
    if (okCounts['room.spectate'] == null) assert.fail('fuzz never took a spectator seat');
    for (const sess of srv.registry.all()) {
      const r = sess.roomCode ? srv.lobby.rooms.get(sess.roomCode) : null;
      if (sess.roomCode) assert.ok(r?.seatOf(sess.playerId) || r?.spectatorOf(sess.playerId), 'session points at its seat');
    }
    const h = JSON.parse((await httpReq(srv.port, '/healthz')).body.toString());
    assert.equal(h.ok, true);
  });

  test('frames still in flight from a replaced socket are ignored (no orphan sessions)', async () => {
    for (let i = 0; i < 5; i++) {
      const a = await pool.player('Twin');
      const before = srv.registry.size;
      const b = await pool.connect();
      b.send({ t: 'hello', name: 'Twin', token: a.token, version: 1 });
      for (let k = 0; k < 5; k++) a.send({ t: 'hello', name: 'Ghost', version: 1 });
      a.send({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
      const info = await a.closed;
      assert.equal(info.code, 4001);
      const w = await b.waitFor('welcome');
      assert.equal(w.playerId, a.id);
      await delay(30);
      assert.equal(srv.registry.size, before, 'no session minted by the replaced socket');
      assert.ok(![...srv.registry.all()].some((x) => x.name === 'Ghost'));
    }
  });

  test('repeated hello resyncs only the requester unless the seat visibly changed', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await host.waitFor('room.state', (s) => !!seatOf(s, guest.id));
    host.clearInbox();
    guest.clearInbox();
    for (let i = 0; i < 5; i++) await guest.hello('Guest');
    for (let i = 0; i < 5; i++) await guest.waitFor('room.state', (s) => s.code === st.code);
    await host.expectNone('room.state');
    await guest.hello('Renamed');
    const renamed = await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.name === 'Renamed');
    assert.equal(renamed.hostId, host.id);
  });

  test('resend-heavy intents (g.watch) have their own small bucket: RATE, socket survives, bucket refills', async () => {
    const c = await pool.player('Watcher');
    await createRoom(c, 'solo', 'NORMAL');
    await expectOk(c, { t: 'room.start' });
    await c.waitFor('m.public');
    const replies = [];
    for (let i = 0; i < 20; i++) replies.push(c.request({ t: 'g.watch', fieldId: 'f0' }));
    const got = await Promise.all(replies);
    const oks = got.filter((r) => r.t === 'ok').length;
    const rated = got.filter((r) => r.t === 'error' && r.code === ERR.RATE).length;
    assert.equal(oks + rated, 20);
    assert.ok(oks >= 6 && oks <= 8, `burst of ~6 accepted, got ${oks}`);
    await expectOk(c, { t: 'g.emote', id: 'autochess_battle_happy' }); // other intents are unaffected
    await delay(600);
    await expectOk(c, { t: 'g.watch', fieldId: 'f0' });
    assert.ok(c.isOpen);
  });

  test('healthz counts rooms and sockets', async () => {
    const c = await pool.player('Counter');
    await createRoom(c);
    const r = await httpReq(srv.port, '/healthz');
    const h = JSON.parse(r.body.toString());
    assert.ok(h.rooms >= 1);
    assert.ok(h.sockets >= 1);
    assert.ok(h.sessions >= 1);
  });
});

// ---------------------------------------------------------------------------------------------------
// Short timers + instrumented match
// ---------------------------------------------------------------------------------------------------

class RecordingMatch extends Match {
  static instances = [];
  static failStart = false;
  constructor(opts) {
    super(opts);
    this.opts = opts;
    this.calls = [];
    RecordingMatch.instances.push(this);
  }
  start() {
    this.calls.push(['start']);
    if (RecordingMatch.failStart) throw new Error('intentional start failure');
    super.start();
  }
  handle(playerId, msg) {
    this.calls.push(['handle', playerId, msg.t]);
    if (msg.t === 'g.buy' && msg.slot === 13) throw new Error('intentional handler crash');
    if (msg.t === 'g.sell') return { error: ERR.NO_FUNDS };
    if (msg.t === 'g.freeze') return { error: 'NOT_A_REAL_CODE' };
    if (msg.t === 'g.destroy') return { error: 'constructor' };
    if (msg.t === 'g.levelUp') return undefined;
    if (msg.t === 'g.autoplay') return Promise.reject(new Error('async handler rejection'));
    return super.handle(playerId, msg);
  }
  onDisconnect(playerId) { this.calls.push(['onDisconnect', playerId]); super.onDisconnect(playerId); }
  onReconnect(playerId) { this.calls.push(['onReconnect', playerId]); super.onReconnect(playerId); }
  onLeave(playerId) { this.calls.push(['onLeave', playerId]); super.onLeave(playerId); }
  addSpectator(playerId) { this.calls.push(['addSpectator', playerId]); }
  removeSpectator(playerId) { this.calls.push(['removeSpectator', playerId]); }
  dispose() { this.calls.push(['dispose']); super.dispose(); }
}

describe('lobby timers and match interface', () => {
  let srv;
  let pool;
  const cap = captureLog();
  const GRACE = 300;
  const WINDOW = 1200;

  beforeAll(async () => {
    srv = await startServer({
      port: 0, host: '127.0.0.1', log: cap.log, MatchClass: RecordingMatch, seedFn: () => 123456789,
      lobbyGraceMs: GRACE, reconnectWindowMs: WINDOW,
    });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  afterEach(async () => {
    RecordingMatch.failStart = false;
    await pool.closeAll();
  });
  afterAll(async () => { await srv?.close(); });

  test('lobby grace: disconnected guest is removed, then told room.closed{timeout} on resume', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await guest.terminate();
    await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.connected === false);
    const removed = await host.waitFor('room.state', (s) => s.seats[1] === null, GRACE + 1000);
    assert.equal(removed.hostId, host.id);
    const back = await pool.connect();
    const w = await back.hello('Guest', guest.token);
    assert.equal(w.resumed, true);
    const closed = await back.waitFor('room.closed');
    assert.equal(closed.reason, 'timeout');
    await back.expectNone('room.state');
  });

  test('lobby grace: host removed → host transfers to the connected guest', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await host.terminate();
    const transferred = await guest.waitFor('room.state', (s) => s.hostId === guest.id, GRACE + 1000);
    assert.equal(transferred.seats[0], null);
    await expectOk(guest, { t: 'room.addBot' });
  });

  test('spectator seats: lobby grace like a player; never the host; the match hooks (opts.spectators, addSpectator / removeSpectator, only g.watch)', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const spec = await pool.player('Spec');
    await expectOk(spec, { t: 'room.spectate', code: st.code });
    // a dropped spectator keeps its seat for the lobby grace, then is freed and told room.closed {timeout} on resume
    const gone = await pool.player('Gone');
    await expectOk(gone, { t: 'room.spectate', code: st.code });
    await gone.terminate();
    await host.waitFor('room.state', (s) => s.spectators.find((x) => x.playerId === gone.id)?.connected === false);
    host.clearInbox();
    await host.waitFor('room.state', (s) => s.spectators.length === 1, GRACE + 1000);
    const goneBack = await pool.connect();
    await goneBack.hello('Gone', gone.token);
    assert.equal((await goneBack.waitFor('room.closed')).reason, 'timeout');
    // the match: the spectator is passed apart from the seats
    RecordingMatch.instances.length = 0;
    await expectOk(host, { t: 'room.start' });
    const m = RecordingMatch.instances[0];
    assert.deepEqual(m.opts.spectators, [spec.id]);
    assert.deepEqual(m.opts.seats.map((s) => s.playerId), [host.id]);
    // only g.watch of a spectator reaches the match
    await expectError(spec, { t: 'g.levelUp' }, ERR.SPECTATOR);
    await spec.request({ t: 'g.watch', fieldId: `n:${host.id}` });
    assert.deepEqual(m.calls.filter((c) => c[0] === 'handle' && c[1] === spec.id).map((c) => c[2]), ['g.watch']);
    // joining mid-match, a drop (the match is not told), a resume (resync) → addSpectator; leaving → removeSpectator
    const late = await pool.player('Late');
    await expectOk(late, { t: 'room.spectate', code: st.code });
    await late.terminate();
    await host.waitFor('room.state', (s) => s.spectators.find((x) => x.playerId === late.id)?.connected === false);
    host.clearInbox();
    const back = await pool.connect();
    await back.hello('Late', late.token);
    await host.waitFor('room.state', (s) => s.spectators.find((x) => x.playerId === late.id)?.connected === true);
    await expectOk(back, { t: 'g.leave' });
    await host.waitFor('room.state', (s) => s.spectators.length === 1);
    const hooks = m.calls.filter((c) => c[1] === late.id).map((c) => c[0]);
    assert.deepEqual(hooks, ['addSpectator', 'addSpectator', 'removeSpectator'], 'never onDisconnect / onReconnect / onLeave');
    // the host leaves mid-match: a spectator never becomes the host and never keeps the room
    await expectOk(host, { t: 'room.leave' });
    assert.equal((await spec.waitFor('room.closed')).reason, 'empty');
  });

  test('match number: every match of a room gets the next matchNo (battleIds stay unique even with the same seed)', async () => {
    const solo = await pool.player('Solo');
    await createRoom(solo, 'solo', 'FUNNY');
    RecordingMatch.instances.length = 0;
    for (let i = 0; i < 2; i++) {
      solo.clearInbox();
      await expectOk(solo, { t: 'room.start' });
      await solo.waitFor('m.public', (p) => p.phase === 'INFO_CHECK');
      await expectOk(solo, { t: 'g.infoReady' }); // the stub ends once every human confirmed the briefing
      await solo.waitFor('room.state', (s) => !s.inMatch);
    }
    assert.deepEqual(RecordingMatch.instances.map((m) => [m.opts.seed, m.opts.matchNo]), [[123456789, 1], [123456789, 2]]);
    await expectOk(solo, { t: 'room.leave' });
  });

  test('match hooks: seats/seed passed, onDisconnect/onReconnect, handler results, crash → INTERNAL', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host, 'coop', 'ABYSS');
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await expectOk(host, { t: 'room.addBot' });
    await expectOk(guest, { t: 'room.ready', ready: true });
    RecordingMatch.instances.length = 0;
    await expectOk(host, { t: 'room.start' });
    const m = RecordingMatch.instances[0];
    assert.ok(m);
    assert.equal(m.opts.roomCode, st.code);
    assert.equal(m.opts.mode, 'coop');
    assert.equal(m.opts.difficulty, 'ABYSS');
    assert.equal(m.opts.modeId, 'mode_multi_abyss');
    assert.equal(m.opts.seed, 123456789);
    assert.equal(typeof m.opts.data, 'object');
    assert.deepEqual(m.opts.seats.map((s) => [s.seat, s.isBot, s.connected]), [[0, false, true], [1, false, true], [2, true, true]]);
    assert.equal(m.opts.seats[0].playerId, host.id);

    await expectError(guest, { t: 'g.sell', uid: 1 }, ERR.NO_FUNDS);
    await expectError(guest, { t: 'g.freeze' }, ERR.INTERNAL);
    await expectError(guest, { t: 'g.destroy', uid: 5 }, ERR.INTERNAL);
    await expectOk(guest, { t: 'g.levelUp' });
    await expectError(guest, { t: 'g.buy', slot: 13 }, ERR.INTERNAL);
    assert.ok(guest.isOpen);
    await expectOk(guest, { t: 'g.autoplay', on: true }); // contract violation (async) is logged, never unhandled
    await delay(10);
    assert.ok(cap.errors.some((e) => e.includes('returned a Promise')));
    assert.ok(cap.errors.some((e) => e.includes('async handler rejection')));
    await expectOk(guest, { t: 'g.buy', slot: 1 });
    assert.ok(!m.calls.some((c) => c[0] === 'handle' && c[2] === 'g.leave'));

    await guest.terminate();
    await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.connected === false);
    assert.deepEqual(m.calls.filter((c) => c[0] === 'onDisconnect'), [['onDisconnect', guest.id]]);
    const back = await pool.connect();
    await back.hello('Guest', guest.token);
    await back.waitFor('m.private');
    assert.deepEqual(m.calls.filter((c) => c[0] === 'onReconnect'), [['onReconnect', guest.id]]);

    // repeated hello = cheap resync
    await back.hello('Guest');
    await back.waitFor('m.private');
    assert.equal(m.calls.filter((c) => c[0] === 'onReconnect').length, 2);

    await expectOk(host, { t: 'g.infoReady' });
    await expectOk(back, { t: 'g.infoReady' });
    await host.waitFor('room.state', (s) => !s.inMatch);
    await delay(20);
    assert.equal(m.calls.filter((c) => c[0] === 'dispose').length, 1, 'disposed exactly once after onEnd');
    assert.ok(cap.errors.some((e) => e.includes('intentional handler crash')));
  });

  test('repeated hellos during a match coalesce into at most one match resync per window', async () => {
    const host = await pool.player('Host');
    await createRoom(host, 'solo', 'NORMAL');
    RecordingMatch.instances.length = 0;
    await expectOk(host, { t: 'room.start' });
    await host.waitFor('m.private');
    const m = RecordingMatch.instances[0];
    const resyncs = () => m.calls.filter((c) => c[0] === 'onReconnect').length;
    host.clearInbox();
    for (let i = 0; i < 12; i++) await host.hello('Host');
    for (let i = 0; i < 12; i++) await host.waitFor('room.state'); // the cheap part answers every hello
    assert.equal(resyncs(), 1, 'first repeated hello resyncs at once, the rest wait for the window');
    await host.waitFor('m.private');
    await host.waitFor('m.private', () => true, 1500); // one coalesced resync answers the other 11
    assert.equal(resyncs(), 2);
    await delay(1100);
    assert.equal(resyncs(), 2, 'nothing else was queued');
    // a (re)connect is never delayed
    await host.terminate();
    const back = await pool.connect();
    await back.hello('Host', host.token);
    await back.waitFor('m.private');
    assert.equal(resyncs(), 3);
  });

  test('match start failure → INTERNAL, room stays in LOBBY', async () => {
    const host = await pool.player('Host');
    await createRoom(host, 'solo', 'NORMAL');
    RecordingMatch.failStart = true;
    RecordingMatch.instances.length = 0;
    await expectError(host, { t: 'room.start' }, ERR.INTERNAL);
    const st = await host.waitFor('room.state', (s) => !s.inMatch && RecordingMatch.instances.length === 1);
    assert.equal(st.inMatch, false);
    await delay(10);
    assert.deepEqual(RecordingMatch.instances[0].calls.map((c) => c[0]), ['start', 'dispose']);
    RecordingMatch.failStart = false;
    await expectOk(host, { t: 'room.start' });
    await host.waitFor('m.public');
  });

  test('reconnect window expiry during a match → onLeave; old token no longer resumes; empty room disposed', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await expectOk(guest, { t: 'room.ready', ready: true });
    RecordingMatch.instances.length = 0;
    await expectOk(host, { t: 'room.start' });
    const m = RecordingMatch.instances[0];
    await guest.terminate();
    await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.connected === false);
    await delay(WINDOW + 700);
    assert.deepEqual(m.calls.filter((c) => c[0] === 'onLeave'), [['onLeave', guest.id]]);
    const back = await pool.connect();
    const w = await back.hello('Guest', guest.token);
    assert.equal(w.resumed, false);
    assert.notEqual(w.playerId, guest.id);

    // host drops too and never returns → room disposed after the window
    await host.terminate();
    await delay(WINDOW + 700);
    assert.ok(m.calls.some((c) => c[0] === 'dispose'));
    await expectError(back, { t: 'room.join', code: st.code }, ERR.ROOM_NOT_FOUND);
  });

  test('match ending while a human is disconnected gives that human the lobby grace', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await expectOk(guest, { t: 'room.ready', ready: true });
    await expectOk(host, { t: 'room.start' });
    await expectOk(guest, { t: 'g.infoReady' });
    await guest.terminate();
    await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.connected === false);
    host.clearInbox();
    await expectOk(host, { t: 'g.infoReady' }); // disconnected guest already ready → match ends
    const lobbyState = await host.waitFor('room.state', (s) => !s.inMatch);
    assert.equal(seatOf(lobbyState, guest.id)?.connected, false);
    const freed = await host.waitFor('room.state', (s) => !s.inMatch && s.seats[1] === null, GRACE + 1000);
    assert.ok(freed);
  });

  test('a dropped solo run keeps the official singleReconnectTime (24 h), not the 10-minute window', () => {
    assert.equal(srv.lobby.soloResumeWindowMs(), 86_400 * 1000, 'data config.constants.singleReconnectTime');
    assert.ok(srv.lobby.soloResumeWindowMs() > WINDOW);
  });
});

// ---------------------------------------------------------------------------------------------------
// Solo runs: 下半 solo has no prep / 机变 timer and may be resumed within singleReconnectTime (24 h, research 01 §1,
// 06 §17); only co-op sessions expire after the reconnect window (real Match: the untimed solo match waits).
// ---------------------------------------------------------------------------------------------------

describe('solo resume window', () => {
  const WINDOW = 300;       // stands in for the 10-minute reconnect window
  const SOLO_WINDOW = 1500; // stands in for singleReconnectTime (24 h)
  let srv;
  let url;
  const open = [];
  const cap = captureLog();

  beforeAll(async () => {
    srv = await startServer({
      port: 0, host: '127.0.0.1', log: cap.log, MatchClass: RealMatch, seedFn: () => 20260929,
      reconnectWindowMs: WINDOW, soloReconnectWindowMs: SOLO_WINDOW, lobbyGraceMs: 200,
    });
    url = `ws://127.0.0.1:${srv.port}/ws`;
  });
  afterAll(async () => {
    await Promise.all(open.map((c) => c.terminate().catch(() => {})));
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });
  const connect = async () => { const c = await TestClient.connect(url); open.push(c); return c; };

  test('solo: resumable past the reconnect window, the match waits; expires only after the solo window', async () => {
    const a = await connect();
    const w = await a.hello('Solo');
    a.id = w.playerId;
    const st = await createRoom(a, 'solo', 'NORMAL');
    await expectOk(a, { t: 'room.start' });
    await a.waitFor('m.public', (p) => p.phase === PHASE.INFO_CHECK && p.deadline === 0);
    const room = srv.lobby.getRoom(st.code);
    const match = room.match;
    await a.terminate();
    await delay(WINDOW + 600); // several sweeps past the co-op window
    assert.equal(room.match, match, 'the solo match still runs');
    assert.equal(match.players.get(a.id).left, false, 'not treated as a quit');

    const b = await connect();
    const w2 = await b.hello('Solo', w.token);
    assert.equal(w2.resumed, true);
    assert.equal(w2.playerId, a.id);
    assert.equal((await b.waitFor('room.state')).inMatch, true);
    await b.waitFor('m.public', (p) => p.phase === PHASE.INFO_CHECK);
    await b.waitFor('m.private');

    // a reconnect re-evaluates the window: the extension is set at every drop, and still ends after the solo window
    await b.terminate();
    await delay(SOLO_WINDOW + 700);
    assert.equal(match.ended, true, 'expiry after the solo window → onLeave → abandoned');
    assert.equal(srv.lobby.getRoom(st.code), null, 'empty room disposed');
    const c = await connect();
    const w3 = await c.hello('Solo', w.token);
    assert.equal(w3.resumed, false);
    assert.notEqual(w3.playerId, a.id);
  });

  test('co-op sessions keep the plain reconnect window; a solo player back in the lobby too', async () => {
    const a = await connect();
    const w = await a.hello('Coop');
    a.id = w.playerId;
    const st = await createRoom(a, 'coop', 'NORMAL');
    await expectOk(a, { t: 'room.addBot' });
    await expectOk(a, { t: 'room.start' });
    await a.waitFor('m.public', (p) => p.phase === PHASE.INFO_CHECK);
    const match = srv.lobby.getRoom(st.code).match;
    await a.terminate();
    await delay(WINDOW + 600);
    assert.equal(match.players.get(a.id).left, true, 'co-op: the window expired → onLeave');
    const b = await connect();
    assert.equal((await b.hello('Coop', w.token)).resumed, false);

    // solo room without a running match: no extension (the lobby grace frees the seat anyway)
    const s = await connect();
    const ws = await s.hello('Idle');
    s.id = ws.playerId;
    await createRoom(s, 'solo', 'NORMAL');
    await s.terminate();
    await delay(WINDOW + 600);
    const s2 = await connect();
    assert.equal((await s2.hello('Idle', ws.token)).resumed, false);
  });
});

// ---------------------------------------------------------------------------------------------------
// Result replay: humans who miss m.result (dropped socket, reloaded tab) still get the result screen
// ---------------------------------------------------------------------------------------------------

/** Stub match that, like the real Match, sends m.result per player (unicast) when `unicast` is set. */
class ReplayMatch extends Match {
  static unicast = false;
  static instances = [];
  constructor(opts) { super(opts); ReplayMatch.instances.push(this); }
  maybeFinish(deadlinePassed) {
    if (!ReplayMatch.unicast) { super.maybeFinish(deadlinePassed); return; }
    if (this.ended || this.disposed) return;
    if (!deadlinePassed) for (const p of this.players.values()) if (!p.isBot && !p.left && !p.ready) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.ended = true;
    this.phase = PHASE.RESULT;
    this.broadcastFn(this.publicView());
    for (const p of this.players.values()) {
      if (!p.isBot && !p.left) this.sendFn(p.playerId, { t: 'm.result', victory: true, roundsPassed: 7, playerId: p.playerId, players: [] });
    }
    this.onEndFn({ victory: true });
  }
}

describe('match result replay', () => {
  let srv;
  let pool;
  const cap = captureLog();
  const GRACE = 400;

  beforeAll(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: ReplayMatch, lobbyGraceMs: GRACE, resyncMinGapMs: 200 });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  afterEach(async () => {
    ReplayMatch.unicast = false;
    await pool.closeAll();
  });
  afterAll(async () => {
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  /** Host + guest co-op match; the guest drops, then the host's infoReady ends it. */
  async function endWhileGuestAway() {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await expectOk(guest, { t: 'room.ready', ready: true });
    await expectOk(host, { t: 'room.start' });
    await expectOk(guest, { t: 'g.infoReady' });
    await guest.terminate();
    await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.connected === false);
    await expectOk(host, { t: 'g.infoReady' });
    const hostResult = await host.waitFor('m.result');
    await host.waitFor('room.state', (s) => !s.inMatch);
    return { host, guest, st, hostResult };
  }

  /** Frames of a resumed socket in arrival order (types + phase), after welcome. */
  const order = (c) => c.log.filter((m) => m.t !== 'welcome' && m.t !== 'pong').map((m) => m.t + (m.t === 'm.public' ? `:${m.phase}` : ''));

  for (const unicast of [true, false]) {
    test(`a human disconnected when the match ends gets room.state, the final m.public and m.result on resume (${unicast ? 'per-player' : 'broadcast'} result)`, async () => {
      ReplayMatch.unicast = unicast;
      const { guest, hostResult } = await endWhileGuestAway();
      if (unicast) assert.notEqual(hostResult.playerId, guest.id);
      const back = await pool.connect();
      const w = await back.hello('Guest', guest.token);
      assert.equal(w.resumed, true);
      const res = await back.waitFor('m.result');
      if (unicast) assert.equal(res.playerId, guest.id, 'the player gets their own result');
      else assert.equal(res.reason, hostResult.reason);
      assert.deepEqual(order(back), ['room.state', `m.public:${PHASE.RESULT}`, 'm.result']);
      assert.equal(back.log.find((m) => m.t === 'room.state').inMatch, false);
    });
  }

  test('reloading on the result screen replays it until the player acts in the room; a new match clears it', async () => {
    ReplayMatch.unicast = true;
    const host = await pool.player('Solo');
    await createRoom(host, 'solo', 'NORMAL');
    await expectOk(host, { t: 'room.start' });
    await expectOk(host, { t: 'g.infoReady' });
    await host.waitFor('m.result');
    await host.waitFor('room.state', (s) => !s.inMatch);
    // reload #1 (new socket, same token) → result screen again
    await host.terminate();
    const r1 = await pool.connect();
    await r1.hello('Solo', host.token);
    assert.equal((await r1.waitFor('m.result')).playerId, host.id);
    // a repeated hello (live socket) is a resync too
    await delay(250);
    await r1.hello('Solo');
    await r1.waitFor('m.result');
    // the player moved on (acted in the room) → no more replays
    await expectOk(r1, { t: 'room.ready', ready: true });
    await r1.terminate();
    const r2 = await pool.connect();
    await r2.hello('Solo', host.token);
    await r2.waitFor('room.state');
    await r2.expectNone('m.result', () => true, 300);
    await r2.expectNone('m.public', () => true, 50);

    // a new match replaces any pending replay with the live match state
    await expectOk(r2, { t: 'room.start' });
    await expectOk(r2, { t: 'g.infoReady' });
    await r2.waitFor('m.result');
    await r2.waitFor('room.state', (s) => !s.inMatch);
    await expectOk(r2, { t: 'room.start' });
    await r2.waitFor('m.public', (p) => p.phase === PHASE.INFO_CHECK);
    await r2.terminate();
    const r3 = await pool.connect();
    await r3.hello('Solo', host.token);
    const pub = await r3.waitFor('m.public');
    assert.equal(pub.phase, PHASE.INFO_CHECK);
    await r3.expectNone('m.result', () => true, 200);
  });

  test('a human removed by the lobby grace after the match still gets the result after room.closed{timeout}', async () => {
    ReplayMatch.unicast = true;
    const { host, guest } = await endWhileGuestAway();
    await host.waitFor('room.state', (s) => !s.inMatch && !seatOf(s, guest.id), GRACE + 1000);
    const back = await pool.connect();
    await back.hello('Guest', guest.token);
    assert.equal((await back.waitFor('room.closed')).reason, 'timeout');
    assert.equal((await back.waitFor('m.result')).playerId, guest.id);
    assert.deepEqual(order(back), ['room.closed', `m.public:${PHASE.RESULT}`, 'm.result']);
    // delivered once
    await back.terminate();
    const again = await pool.connect();
    await again.hello('Guest', guest.token);
    await again.expectNone(null, (m) => m.t !== 'welcome', 300);
  });

  test('real Match: a human who is away when the match finishes gets its m.result on resume', async () => {
    const real = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: RealMatch, seedFn: () => 1312887319 });
    const matches = [];
    try {
      const url = `ws://127.0.0.1:${real.port}/ws`;
      const a = await TestClient.connect(url);
      const w = await a.hello('A');
      a.id = w.playerId;
      await createRoom(a, 'coop', 'FUNNY');
      for (let i = 0; i < 3; i++) await expectOk(a, { t: 'room.addBot' });
      await expectOk(a, { t: 'room.start' });
      await a.waitFor('m.public', (p) => p.phase === PHASE.INFO_CHECK);
      const room = real.lobby.getRoom([...real.lobby.rooms.keys()][0]);
      const m = room.match;
      matches.push(m);
      await a.terminate();
      await delay(30);
      m.finish({ victory: true, reason: 'victory' });
      assert.equal(room.match, null, 'room back in LOBBY');
      const b = await TestClient.connect(url);
      await b.hello('A', w.token);
      const res = await b.waitFor('m.result', () => true, 3000);
      assert.equal(res.playerId, a.id);
      assert.equal(res.victory, true);
      const pub = b.log.find((x) => x.t === 'm.public');
      assert.equal(pub.phase, PHASE.RESULT);
      await b.terminate();
    } finally {
      for (const m of matches) m.dispose?.();
      await real.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// Per-network limits (clients behind a local reverse proxy, e.g. cloudflared, identified by forwarding headers)
// ---------------------------------------------------------------------------------------------------

describe('per-network limits', () => {
  let srv;
  let url;
  const open = new Set();
  const cap = captureLog();

  beforeAll(async () => {
    srv = await startServer({
      port: 0, host: '127.0.0.1', log: cap.log, MatchClass: Match,
      maxRoomsPerAddr: 3, maxMatchesPerAddr: 2, maxConnectionsPerAddr: 4,
    });
    url = `ws://127.0.0.1:${srv.port}/ws`;
  });
  afterEach(async () => {
    await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
    open.clear();
    await delay(20);
  });
  afterAll(async () => {
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  /** Connect as a client whose address the local proxy forwards (null = a local peer without proxy). */
  async function netPlayer(name, ip) {
    const c = await TestClient.connect(url, { wsOptions: ip ? { headers: { 'X-Forwarded-For': `10.9.9.9, ${ip}` } } : {} });
    open.add(c);
    const w = await c.hello(name);
    c.id = w.playerId;
    c.token = w.token;
    return c;
  }
  /** The orphan loop: create a co-op room with AI, start it, walk away. Returns the room.start reply. */
  async function orphan(ip, i) {
    const c = await netPlayer(`orphan${i}`, ip);
    const r = await c.request({ t: 'room.create', mode: 'coop', difficulty: 'FUNNY' });
    if (r.t !== 'ok') { await c.terminate(); return { create: r }; }
    await expectOk(c, { t: 'room.addBot' });
    const start = await c.request({ t: 'room.start' });
    await c.terminate();
    return { create: r, start };
  }

  test('a socket loop cannot keep more than maxMatchesPerAddr unattended matches or maxRoomsPerAddr rooms', async () => {
    const A = '203.0.113.7';
    const keeper = await netPlayer('keeper', A); // stays connected in its running match
    await createRoom(keeper, 'solo', 'FUNNY');
    await expectOk(keeper, { t: 'room.start' });
    const first = await orphan(A, 1);
    assert.equal(first.start.t, 'ok');
    const second = await orphan(A, 2);
    assert.equal(second.create.t, 'ok', 'third room from A still allowed');
    assert.equal(second.start.t, 'error');
    assert.equal(second.start.code, ERR.RATE, 'third concurrent match from A refused');
    const third = await orphan(A, 3);
    assert.equal(third.create.code, ERR.RATE, 'fourth room from A refused');
    assert.match(third.create.detail, /rooms/);
    const h1 = JSON.parse((await httpReq(srv.port, '/healthz')).body.toString());

    // other networks and local peers are unaffected
    const other = await orphan('198.51.100.20', 4);
    assert.equal(other.start.t, 'ok');
    for (let i = 0; i < 4; i++) assert.equal((await orphan(null, 10 + i)).start.t, 'ok', 'local peers are not limited');
    const h2 = JSON.parse((await httpReq(srv.port, '/healthz')).body.toString());
    assert.equal(h2.matches, h1.matches + 5);

    // a match from A ends → capacity is back
    await expectOk(keeper, { t: 'g.leave' });
    const again = await netPlayer('again', A);
    const st = await again.request({ t: 'room.create', mode: 'solo', difficulty: 'FUNNY' });
    assert.equal(st.t, 'ok', JSON.stringify(st));
    await expectOk(again, { t: 'room.start' });
  });

  test('creating a room from your only room does not count the room being left', async () => {
    const B = '203.0.113.99';
    const c = await netPlayer('hopper', B);
    for (let i = 0; i < 6; i++) await expectOk(c, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
  });

  test('per-network socket cap is enforced at upgrade (429); other networks and local peers are unaffected', async () => {
    const C = '2001:db8:1:2::10';
    const socks = [];
    for (let i = 0; i < 4; i++) socks.push(await netPlayer(`s${i}`, `2001:db8:1:2::${i + 1}`)); // same /64
    await assert.rejects(TestClient.connect(url, { wsOptions: { headers: { 'X-Forwarded-For': C } } }), /429/);
    const other = await netPlayer('other', '2001:db8:1:3::1');
    const local = await netPlayer('local', null);
    assert.ok(other.isOpen && local.isOpen);
    await socks[0].close();
    await delay(50);
    const ok = await netPlayer('s4', C);
    assert.ok(ok.isOpen, 'a slot freed up');
  });
});

// ---------------------------------------------------------------------------------------------------
// Heartbeat, hello timeout, shutdown
// ---------------------------------------------------------------------------------------------------

describe('heartbeat and shutdown', () => {
  test('dead sockets are terminated by the heartbeat; silent sockets hit the hello timeout', async () => {
    const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, heartbeatMs: 80, helloTimeoutMs: 150 });
    try {
      const url = `ws://127.0.0.1:${srv.port}/ws`;
      const deaf = await TestClient.connect(url, { wsOptions: { autoPong: false } });
      await deaf.hello('Deaf');
      const healthy = await TestClient.connect(url);
      await healthy.hello('Healthy');
      const info = await Promise.race([deaf.closed, delay(2000).then(() => null)]);
      assert.ok(info, 'deaf socket closed');
      assert.equal(info.code, 1006, 'terminated without a close frame');

      const silent = await TestClient.connect(url);
      const silentInfo = await Promise.race([silent.closed, delay(2000).then(() => null)]);
      assert.equal(silentInfo?.code, 4002);

      assert.ok(healthy.isOpen, 'healthy socket survives heartbeats');
      await healthy.close();
    } finally {
      await srv.close();
    }
  });

  test('close() notifies rooms (room.closed shutdown) and closes sockets with 1001', async () => {
    const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    const w = await c.hello('Last');
    c.id = w.playerId;
    await createRoom(c);
    await srv.close();
    const closed = await c.waitFor('room.closed');
    assert.equal(closed.reason, 'shutdown');
    const info = await c.closed;
    assert.equal(info.code, 1001);
    await assert.rejects(httpReq(srv.port, '/healthz'));
  });
});

// ---------------------------------------------------------------------------------------------------
// Units: data loader, name sanitizer, token bucket, registry
// ---------------------------------------------------------------------------------------------------

describe('match stub (server/match/Match.js)', () => {
  const STATUSES = ['acting', 'ready', 'deciding', 'combat', 'done', 'helping', 'left', 'dead'];
  const mk = (over = {}) => {
    const out = { sent: [], bc: [], ended: [] };
    const m = new Match({
      roomCode: 'ABCD', mode: 'coop', difficulty: 'HARD', modeId: 'mode_multi_hard', seed: 7,
      seats: [
        { seat: 0, playerId: 'p_a', name: 'A', isBot: false, connected: true },
        { seat: 1, playerId: 'p_b', name: 'B', isBot: false, connected: true },
        { seat: 3, playerId: 'ai_1', name: 'AI', isBot: true, connected: true },
      ],
      data: { config: { modes: { mode_multi_hard: { lastRound: 14 } }, timers: { infoCheck: 0.08 } } },
      send: (id, msg) => { out.sent.push([id, msg]); return true; },
      broadcast: (msg) => out.bc.push(msg),
      onEnd: (summary) => out.ended.push([summary, out.bc.length]),
      ...over,
    });
    return { m, out };
  };

  test('m.public / m.private follow the DESIGN §8.2 / §8.3 shapes', () => {
    const { m, out } = mk();
    m.start();
    const pub = out.bc[0];
    assert.equal(pub.t, 'm.public');
    for (const k of ['phase', 'round', 'lastRound', 'deadline', 'serverNow', 'modeId', 'difficulty', 'stageId', 'factions', 'disabledBonds', 'bannedChess', 'bossId', 'players', 'fields']) {
      assert.ok(k in pub, `m.public.${k}`);
    }
    assert.equal(pub.phase, 'INFO_CHECK');
    assert.equal(pub.lastRound, 14);
    assert.ok(pub.deadline > pub.serverNow && pub.deadline - pub.serverNow <= 80);
    for (const p of pub.players) {
      for (const k of ['playerId', 'seat', 'name', 'isBot', 'connected', 'alive', 'lp', 'bandId', 'shopLevel', 'boardCount', 'ready', 'bonds', 'fieldId', 'status']) {
        assert.ok(k in p, `players[].${k}`);
      }
      assert.ok(STATUSES.includes(p.status), p.status);
      assert.ok(Array.isArray(p.bonds));
    }
    assert.equal(out.sent.length, 2, 'one m.private per human, none for bots');
    for (const [id, priv] of out.sent) {
      assert.equal(priv.t, 'm.private');
      assert.equal(priv.playerId, id);
      for (const k of ['seat', 'alive', 'lp', 'funds', 'bandId', 'ready', 'canReady', 'shop', 'hand', 'temp', 'board', 'deployCap', 'deployCount', 'bonds', 'effects', 'nextEnemies', 'stats']) {
        assert.ok(k in priv, `m.private.${k}`);
      }
      for (const k of ['level', 'maxLevel', 'upgradePrice', 'refreshPrice', 'freeRefreshes', 'frozen', 'slots', 'rewardOffer']) assert.ok(k in priv.shop, `shop.${k}`);
      assert.equal(priv.hand.length, 10);
      assert.equal(priv.temp.length, 5);
      assert.ok(Array.isArray(priv.bonds) && Array.isArray(priv.board) && Array.isArray(priv.effects));
    }
    m.dispose();
  });

  test('lastRound comes from config (fallback 9 for solo FUNNY, else 14)', () => {
    assert.equal(mk({ data: {}, mode: 'solo', difficulty: 'FUNNY', modeId: 'mode_single_funny' }).m.lastRound, 9);
    assert.equal(mk({ data: undefined }).m.lastRound, 14);
    assert.equal(mk({ data: { config: { modes: { mode_multi_hard: { lastRound: 11 } } } } }).m.lastRound, 11);
    const real = loadData(ROOT, { log: { warn() {}, error() {} } });
    if (real.config?.modes) {
      assert.equal(mk({ data: real, mode: 'solo', difficulty: 'FUNNY', modeId: 'mode_single_funny' }).m.lastRound, 9);
      assert.equal(mk({ data: real }).m.lastRound, 14);
    }
  });

  test('INFO_CHECK deadline ends the stub once (m.result before onEnd); ready/leave also end it', async () => {
    const { m, out } = mk();
    m.start();
    assert.deepEqual(m.handle('p_a', { t: 'g.infoReady' }), { ok: true });
    assert.equal(out.ended.length, 0);
    await delay(200);
    assert.equal(out.ended.length, 1);
    assert.equal(out.ended[0][0].reason, 'timeout');
    assert.ok(out.bc.slice(0, out.ended[0][1]).some((x) => x.t === 'm.result'), 'm.result sent before onEnd');
    assert.deepEqual(m.handle('p_a', { t: 'g.infoReady' }), { error: ERR.WRONG_PHASE });
    m.dispose();
    m.dispose();

    const b = mk();
    b.m.start();
    b.m.handle('p_a', { t: 'g.infoReady' });
    b.m.onLeave('p_b');
    assert.equal(b.out.ended.length, 1);
    assert.equal(b.out.ended[0][0].reason, 'confirmed');
    b.m.dispose();
    await delay(150);
    assert.equal(b.out.ended.length, 1, 'no second onEnd from the cleared deadline timer');

    const c = mk();
    c.m.start();
    c.m.dispose();
    await delay(150);
    assert.equal(c.out.ended.length, 0, 'dispose clears the deadline timer');
    assert.deepEqual(c.m.handle('ai_1', { t: 'g.ready', ready: true }), { error: ERR.NOT_IN_ROOM });
    assert.throws(() => new Match({ seats: [] }), TypeError);
  });
});
