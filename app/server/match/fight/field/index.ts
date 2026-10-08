function entriesOf(value: any): [string, any][] {
  return Object.entries(value) as [string, any][]
}
// server/match/fields.js — runs the battles of one combat phase (DESIGN §4, §11, §14).
//
// Server-run combat (streaming mode, SP_COMBAT=server; and the Final Assault when no field has a connected human):
// FieldRunner steps every live field in lockstep:
//   * real-time pacing (RealScheduler, or VirtualScheduler with instantCombat=false): an interval every 1000/30 ms
//     accumulates elapsed real time × the match's game speed (forced 2×; `opts.combatSpeed` in tests/tools) and
//     steps floor(acc / TICK) ticks, never more than maxTicksPerInterval(speed) (8 at 2×) per interval — the
//     remainder is dropped so a stalled server never spirals.
//   * instant (VirtualScheduler default): every field is stepped to completion synchronously.
//   * a solo pause (Match.paused, g.pause) skips the intervals: the field clock stands still (HeadlessPacer too).
// Every SNAP_EVERY (3) ticks of a field its events are drained; watchers of that field get `b.ev` then `b.snap`, both
// carrying the field's game time `gt` (`emit: false` skips the streaming: server-run fields under client-side combat).
// Per-field isolation: an exception from step() force-ends that field as a timeout (and, if even that throws, the
// field is closed with a synthetic result). A hard cap (HARD_CAP_SECONDS of game time) force-ends anything left.
// Results that did not come from a finished battle carry `synthetic: true` (the match never charges LP for them).
//
// Client-side combat (DESIGN §14) helpers:
//   HeadlessJob / runHeadless(battle)      step a battle to its end — in wall-clock-bounded slices (bots, takeovers
//                                          under a real scheduler) or at once (verification, virtual time) — and keep a
//                                          progress timeline [[gt, killed, total]] for the teammates' waiting UI
//                                          (联防: [gt, killed, total, left] — left = spec.js uniteLeft, the leakers'
//                                          enemies still standing, for their live counter; user playtest #6 item 7)
//   HeadlessPacer                          real-time pacing of a dynamic set of server-run battles without snapshots
//                                          (boss fields that share the pool while other fields run on clients); a
//                                          takeover's fast-forward is spread over the pacing intervals
//   specBounds(spec, gd) / validateClientResult(spec, result, { gd })
//                                          a client's b.result is accepted only when it is plausible for its spec;
//                                          the returned result is rebuilt from whitelisted fields (never the raw object)
//   uniteBillBounds(spawns, gd)            联防: per leaker, the most survivors settlement can bill (sent in + the
//                                          offspring bound) — the live counter's clamp
//   syntheticResult(players, progress)     stand-in when a boss field's client never reported

import { layerGainRoom } from '@alliance/contract/match.js';
import { contentModules } from '#server/content/loader.js';
import { TICK, createBattle, leakModule, runSteps, type BattleSpec, type MissionModule, type SpawnSpec, type UnitSpec } from 'arknights-mission-core';
const SNAPSHOT_EVERY = 3;
const GRANTED_CAP_OVERRIDE: any = Object.freeze({ garrison_95_a: 12, garrison_95_b: 24 });




export const MAX_TICKS_PER_INTERVAL: any = 8;
export const INTERVAL_MS: any = 1000 / 30;
export const GAME_SPEED: any = 2;
export const HARD_CAP_SECONDS: any = 3700;
const SNAP_EVERY = Number.isInteger(SNAPSHOT_EVERY) && SNAPSHOT_EVERY > 0 ? SNAPSHOT_EVERY : 3;

/** Catch-up cap per pacing interval: 8 ticks at the normal 2× speed, proportionally more when sped up. */
export function maxTicksPerInterval(speed: any) : any {
  return Math.max(MAX_TICKS_PER_INTERVAL, Math.ceil((Number(speed) || GAME_SPEED) * 4));
}

/**
 * Wire frame of a snapshot. Every frame is `{ t: '<type>', …payload }`, so the snapshot's game time (DESIGN §8.2)
 * travels as `gt` (game seconds) — the `t` key is the frame type 'b.snap'. `b.ev` frames carry the same `gt`.
 */
export function snapFrame(fieldId: any, snap: any) : any {
  const { t: gt, ...rest } = snap || {};
  return { ...rest, t: 'b.snap', fieldId, gt: typeof gt === 'number' && Number.isFinite(gt) ? gt : 0 };
}

/** Synthetic per-player result used when a field could not run at all (never punishes the player). */
export function emptyPerPlayer() : any {
  return { killed: 0, total: 0, leaked: [], perfect: true, layerGains: {}, coins: 0, damageDealt: 0, bossDamage: 0, healingDone: 0, deaths: 0, unitsEnd: [], unitStats: [] };
}

/** A finished stand-in for a battle that failed to construct. */
export class DeadBattle {
  [key: string]: any
  constructor(opts: any, reason: any = 'forced') {
    this.fieldId = opts.fieldId ?? null;
    this.kind = opts.kind ?? 'normal';
    this.rect = opts.rect ?? null;
    this.stageId = opts.stageId ?? null;
    this.finished = true;
    this.time = 0;
    this.tickCount = 0;
    this.errorCount = 1;
    const perPlayer: any = {};
    for (const p of opts.players || []) perPlayer[p.playerId] = emptyPerPlayer();
    this._result = { time: 0, reason, perPlayer, killed: 0, total: 0, errors: 1, synthetic: true };
    this.errors = [];
  }
  step() : any {}
  forceEnd() : any {}
  result() : any { return this._result; }
  snapshot() : any { return { fieldId: this.fieldId, t: 0, units: [], dp: 0, killed: 0, total: 0 }; }
  drainEvents() : any { return []; }
  fieldMeta() : any { return { fieldId: this.fieldId, kind: this.kind, rect: this.rect, stageId: this.stageId, units: [] }; }
  on() : any { return null; }
  off() : any {}
}

export class FieldRunner {
  [key: string]: any
  /**
   * @param {import('./Match.js').Match} m
   * @param {Array<{ fieldId: string, kind: string, players: string[], battle: any, live?: boolean }>} fields
   * @param {{ onTick?: (runner: FieldRunner) => void, onDone: (runner: FieldRunner) => void }} hooks
   */
  constructor(m: any, fields: any, { onTick = null, onDone, emit = true }: any) {
    this.m = m;
    this.fields = fields;
    this.emit = emit !== false;
    for (const f of fields) f.live = !f.battle.finished;
    this.onTick = onTick;
    this.onDone = onDone;
    this.ticks = 0;
    this.acc = 0;
    this.last = 0;
    this.interval = null;
    this.done = false;
    this.stopped = false;
    this.crashes = 0;
  }

  /** Game seconds elapsed on the master clock (all fields step in lockstep). */
  get time() : any { return this.ticks * TICK; }

  start() : any {
    if (this.fields.every((f?: any) : any => !f.live)) { this._finish(); return; }
    if (this.m.sched.instant) {
      // one scheduler callback: run everything now (virtual time / tools)
      this.m.later(0, () : any => this._runInstant());
      return;
    }
    this.last = this.m.sched.now();
    this.interval = this.m.sched.setInterval(() : any => this.m.guard(() : any => this._pump()), INTERVAL_MS);
  }

  stop() : any {
    this.stopped = true;
    if (this.interval) { this.m.sched.clearInterval(this.interval); this.interval = null; }
  }

  _runInstant() : any {
    const cap = Math.ceil(HARD_CAP_SECONDS / TICK);
    while (!this.stopped && !this.done && this.ticks < cap) {
      this._tick();
      if (this.fields.every((f?: any) : any => !f.live)) break;
    }
    if (!this.done && !this.stopped) this._forceAll('timeout');
    this._checkDone();
  }

  _pump() : any {
    if (this.stopped || this.done) return;
    const now = this.m.sched.now();
    const dt = Math.max(0, now - this.last);
    this.last = now;
    if (this.m.paused) return; // solo pause (Match.setPause): the field clock stands still
    const speed = Number.isFinite(this.m.gameSpeed) && this.m.gameSpeed > 0 ? this.m.gameSpeed : GAME_SPEED;
    this.acc += (dt / 1000) * speed;
    const cap = maxTicksPerInterval(speed);
    let n = Math.floor(this.acc / TICK + 1e-9);
    if (n > cap) { n = cap; this.acc = 0; } else this.acc -= n * TICK;
    for (let i = 0; i < n && !this.done && !this.stopped; i++) {
      this._tick();
      if (this.fields.every((f?: any) : any => !f.live)) break;
    }
    if (this.time >= HARD_CAP_SECONDS) this._forceAll('timeout');
    this._checkDone();
  }

  _tick() : any {
    this.ticks++;
    for (const f of this.fields) {
      if (!f.live) continue;
      const b = f.battle;
      try {
        b.step();
      } catch (e: any) {
        this.crashes++;
        this.m.reportError(`field ${f.fieldId} step`, e);
        this._forceField(f, 'timeout');
      }
      if (b.finished) { f.live = false; this.m.markPublic(); }
      if (this.ticks % SNAP_EVERY === 0 || !f.live) this._emit(f);
    }
    if (this.onTick) {
      try { this.onTick(this); } catch (e: any) { this.m.reportError('field onTick', e); }
    }
    for (const f of this.fields) if (f.live && f.battle.finished) { f.live = false; this.m.markPublic(); this._emit(f); }
  }

  _forceField(f: any, reason: any) : any {
    try {
      f.battle.forceEnd(reason);
    } catch (e: any) {
      this.m.reportError(`field ${f.fieldId} forceEnd`, e);
    }
    if (!f.battle.finished) {
      // the battle object is unusable: replace it by a finished stand-in (players keep a clean result)
      const dead = new DeadBattle({ fieldId: f.fieldId, kind: f.kind, players: f.players.map((playerId?: any) : any => ({ playerId })) }, 'forced');
      f.battle = dead;
    }
    f.live = false;
    this.m.markPublic();
  }

  /** Force-end every live field (team LP 0, hard cap). */
  _forceAll(reason: any) : any {
    for (const f of this.fields) if (f.live || !f.battle.finished) this._forceField(f, reason);
  }

  forceAll(reason: any = 'forced') : any { this._forceAll(reason); this._checkDone(); }

  _emit(f: any) : any {
    let ev: any[] = [];
    try { ev = f.battle.drainEvents() || []; } catch (e: any) { this.m.reportError(`field ${f.fieldId} drainEvents`, e); }
    if (!this.emit) return;
    const watchers = this.m.watchersOf(f.fieldId);
    if (!watchers.length) return;
    let snapMsg: any = null;
    try { snapMsg = snapFrame(f.fieldId, f.battle.snapshot()); } catch (e: any) { this.m.reportError(`field ${f.fieldId} snapshot`, e); }
    const time = Number(f.battle.time);
    const gt = snapMsg ? snapMsg.gt : Number.isFinite(time) ? time : 0;
    const evMsg = ev.length ? { t: 'b.ev', fieldId: f.fieldId, gt, ev } : null;
    for (const pid of watchers) {
      if (evMsg) this.m.sendTo(pid, evMsg);
      if (snapMsg) this.m.sendTo(pid, snapMsg);
    }
  }

  _checkDone() : any {
    if (this.done || this.stopped) return;
    if (this.fields.some((f?: any) : any => f.live && !f.battle.finished)) return;
    this._finish();
  }

  _finish() : any {
    if (this.done) return;
    this.done = true;
    if (this.interval) { this.m.sched.clearInterval(this.interval); this.interval = null; }
    this.onDone(this);
  }

  /** Result of a field (never throws). */
  resultOf(f: any) : any {
    try {
      const r = f.battle.result();
      if (r && typeof r === 'object' && r.perPlayer) return r;
    } catch (e: any) {
      this.m.reportError(`field ${f.fieldId} result`, e);
    }
    const perPlayer: any = {};
    for (const pid of f.players) perPlayer[pid] = emptyPerPlayer();
    return { time: 0, reason: 'forced', perPlayer, killed: 0, total: 0, errors: 1, synthetic: true };
  }
}

// =====================================================================================================================
// client-side combat (DESIGN §14)

/** Real-time grace after a battle's time limit before the server takes a silent client's field over (ms). */
export const RESULT_GRACE_MS: any = 15_000;
/** A boss field whose authoritative client sent no b.progress for this long is handed over (ms). */
export const BOSS_SILENCE_MS: any = 12_000;
/** Game-time spacing of the progress timeline samples of a server-run field (s). */
export const TIMELINE_EVERY: any = 1;

/** Wall-clock budget of one headless slice under a real scheduler (ms): the host's event loop stays responsive. */
export const HEADLESS_SLICE_MS: any = 8;
/** Extra ticks per pacing interval while a server-paced boss field catches up to its clock (takeover). */
export const CATCHUP_TICKS_PER_INTERVAL: any = 240;
const perfNow = () : any => (globalThis.performance ? globalThis.performance.now() : Date.now());

/**
 * A timeline sample of a battle: [gt, killed, total], plus — 联防 — the leakers' enemies still standing
 * (spec.js uniteLeft; omitted when unknown).
 */
export function timelineSample(b: any) : any {
  const s = [Number(b && b.time) || 0, Number(b && b.killed) || 0, Number(b && b.total) || 0];
  if (b && b.kind === 'unite') {
    let left: any = null;
    try { left = uniteLeft(b); } catch { left = null; }
    if (left) s.push(left);
  }
  return s;
}

/**
 * A server-run battle stepped to its end, in one go or in wall-clock-bounded slices (a low-power host must not stall
 * its event loop for the ~0.1–1 s a whole battle takes, several times at once when bots fight): `run(budgetMs)` steps
 * until the battle ends (→ true) or the budget is used (→ false; checked every 16 ticks). `timeline` grows while it
 * runs (timelineSample: [gt, killed, total(, left)] every TIMELINE_EVERY game seconds, then the final state);
 * `output()` once done gives `{ battle, result, timeline, crashed }`. A throwing battle is force-ended, then replaced by
 * a DeadBattle; the run is bounded by HARD_CAP_SECONDS.
 */
export class HeadlessJob {
  [key: string]: any
  constructor(battle: any, { onError = null, players = [] }: any = {}) {
    this.battle = battle;
    this.onError = onError;
    this.players = players;
    this.timeline = [timelineSample(battle)];
    this.every = Math.max(1, Math.round(TIMELINE_EVERY / TICK));
    this.cap = Math.ceil(HARD_CAP_SECONDS / TICK);
    this.n = 0;
    this.crashed = false;
    this.done = false;
    this._out = null;
  }

  run(budgetMs: any = Infinity, now: any = perfNow) : any {
    if (this.done) return true;
    const timed = Number.isFinite(budgetMs);
    const t0 = timed ? now() : 0;
    let b = this.battle;
    try {
      let k = 0;
      while (!b.finished && this.n < this.cap) {
        b.step();
        this.n++;
        k++;
        if (this.n % this.every === 0) this.timeline.push(timelineSample(b));
        if (timed && (k & 15) === 0 && !b.finished && now() - t0 >= budgetMs) return false;
      }
      if (!b.finished) b.forceEnd('timeout');
    } catch (e: any) {
      this.crashed = true;
      if (this.onError) this.onError(e);
      try { b.forceEnd('timeout'); } catch { /* replaced below */ }
      if (!b.finished) b = this.battle = new DeadBattle({ fieldId: b.fieldId, kind: b.kind, players: this.players.map((playerId?: any) : any => ({ playerId })) }, 'forced');
    }
    this._finish();
    return true;
  }

  _finish() : any {
    const b = this.battle;
    let result: any = null;
    try { result = b.result(); } catch (e: any) { if (this.onError) this.onError(e); }
    if (!result || typeof result !== 'object' || !result.perPlayer) {
      const perPlayer: any = {};
      for (const pid of this.players) perPlayer[pid] = emptyPerPlayer();
      result = { time: Number(b.time) || 0, reason: 'forced', perPlayer, killed: 0, total: 0, errors: 1, synthetic: true };
    }
    this.timeline.push(timelineSample(b));
    this.done = true;
    this._out = { battle: b, result, timeline: this.timeline, crashed: this.crashed };
  }

  output() : any { return this._out; }
}

/**
 * Step a battle to its end right now (HeadlessJob in one go). Returns `{ battle, result, timeline, crashed }`.
 */
export function runHeadless(battle: any, opts: any = {}) : any {
  const job = new HeadlessJob(battle, opts);
  job.run(Infinity);
  return job.output();
}

/** Timeline sample at game time `gt`: [gt, killed, total(, left)] of the last sample ≤ gt. */
export function timelineAt(timeline: any, gt: any) : any {
  if (!Array.isArray(timeline) || !timeline.length) return [0, 0, 0];
  let lo = 0, hi = timeline.length - 1;
  if (gt >= timeline[hi][0]) return timeline[hi];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (timeline[mid][0] <= gt) lo = mid; else hi = mid - 1;
  }
  return timeline[lo];
}

/**
 * Real-time pacing of server-run battles without snapshots (DESIGN §14: boss fields that share the pool while other
 * fields run on clients). `add({ battle, onDone(entry), onTick?(entry) })`; `skipTo(entry, gt)` fast-forwards a newly
 * added battle silently (takeover). Same accumulator / cap rules as FieldRunner.
 */
export class HeadlessPacer {
  [key: string]: any
  constructor(m: any) {
    this.m = m;
    /** @type {Set<{ battle: any, onDone: Function, onTick?: Function, done?: boolean }>} */
    this.entries = new Set();
    this.interval = null;
    this.acc = 0;
    this.last = 0;
    this.stopped = false;
  }

  add(entry: any) : any {
    if (this.stopped || !entry || !entry.battle) return entry;
    this.entries.add(entry);
    if (!this.interval) {
      this.last = this.m.sched.now();
      this.acc = 0;
      this.interval = this.m.sched.setInterval(() : any => this.m.guard(() : any => this._pump()), INTERVAL_MS);
    }
    return entry;
  }

  /**
   * Fast-forward an entry's battle silently until its game time reaches `gt` (bounded). `budgetTicks` (default: all at
   * once) spreads it over the pacing intervals instead — at most that many extra ticks per interval on top of the
   * normal pacing — so a takeover late in a boss fight never stalls the host's event loop.
   */
  skipTo(entry: any, gt: any, { budgetTicks = Infinity }: any = {}) : any {
    const cap = Math.ceil(Math.min(Number(gt) || 0, HARD_CAP_SECONDS) / TICK);
    if (Number.isFinite(budgetTicks) && budgetTicks > 0) {
      entry.skipTicks = cap;
      entry.skipBudget = Math.max(1, Math.floor(budgetTicks));
      entry.skipped = 0;
      return;
    }
    this._skip(entry, cap, Infinity);
  }

  /** Silent steps toward `cap` ticks (at most `max`); returns the steps taken. */
  _skip(entry: any, cap: any, max: any) : any {
    const b = entry.battle;
    let k = 0;
    try {
      while (!b.finished && b.tickCount < cap && k < max) { b.step(); k++; }
    } catch (e: any) {
      this.m.reportError('pacer skip', e);
      try { b.forceEnd('timeout'); } catch { /* ignore */ }
    }
    try { b.drainEvents?.(); } catch { /* ignore */ }
    if (b.finished) this._finish(entry);
    return k;
  }

  remove(entry: any) : any { this.entries.delete(entry); if (!this.entries.size) this._clear(); }

  stop() : any { this.stopped = true; this._clear(); this.entries.clear(); }

  _clear() : any { if (this.interval) { this.m.sched.clearInterval(this.interval); this.interval = null; } }

  _pump() : any {
    if (this.stopped) return;
    const now = this.m.sched.now();
    const dt = Math.max(0, now - this.last);
    this.last = now;
    if (this.m.paused) return; // solo pause (Match.setPause): the field clock stands still
    const speed = Number.isFinite(this.m.gameSpeed) && this.m.gameSpeed > 0 ? this.m.gameSpeed : GAME_SPEED;
    this.acc += (dt / 1000) * speed;
    const cap = maxTicksPerInterval(speed);
    let n = Math.floor(this.acc / TICK + 1e-9);
    if (n > cap) { n = cap; this.acc = 0; } else this.acc -= n * TICK;
    for (const e of [...this.entries]) {
      if (this.stopped) break;
      if (e.done) continue;
      const b = e.battle;
      if (e.skipTicks != null) {
        // sliced fast-forward (takeover): the field clock keeps running, so the target moves with the pacing
        e.skipTicks += n;
        e.skipped += this._skip(e, e.skipTicks, e.skipBudget + n);
        if (e.done) continue;
        if (b.tickCount >= e.skipTicks) e.skipTicks = null;
        if (e.onTick) { try { e.onTick(e); } catch (err: any) { this.m.reportError('pacer onTick', err); } }
        continue;
      }
      for (let i = 0; i < n && !b.finished; i++) {
        try { b.step(); } catch (err: any) {
          this.m.reportError('pacer step', err);
          try { b.forceEnd('timeout'); } catch { /* ignore */ }
          break;
        }
        if (b.time >= HARD_CAP_SECONDS) { try { b.forceEnd('timeout'); } catch { /* ignore */ } }
      }
      if (e.onTick) { try { e.onTick(e); } catch (err: any) { this.m.reportError('pacer onTick', err); } }
      if (b.finished) this._finish(e);
    }
  }

  _finish(e: any) : any {
    if (e.done) return;
    e.done = true;
    this.entries.delete(e);
    if (!this.entries.size) this._clear();
    try { e.onDone(e); } catch (err: any) { this.m.reportError('pacer onDone', err); }
  }
}

/** Synthetic per-player results of a field whose client never reported (boss fields only; no LP relevance). */
export function syntheticResult(players: any, { bossBy = {}, time = 0 }: any = {}) : any {
  const perPlayer: any = {};
  for (const pid of players) perPlayer[pid] = { ...emptyPerPlayer(), bossDamage: Math.max(0, Number(bossBy[pid]) || 0) };
  return { time, reason: 'forced', perPlayer, killed: 0, total: 0, errors: 0, synthetic: true };
}

// ---- result validation ------------------------------------------------------------------------------------------

const derivedCache = new WeakMap();
const ENEMY_KEY_RE = /enemy_[A-Za-z0-9_]+/g;

/** Enemy keys a spawned enemy's data record mentions (summons, splits, transformations): content may spawn them. */
function derivedKeys(gd?: any, key?: any) : any {
  if (!gd || typeof gd.enemy !== 'function') return [];
  let m = derivedCache.get(gd);
  if (!m) { m = new Map(); derivedCache.set(gd, m); }
  if (m.has(key)) return m.get(key);
  const out: any = new Set();
  const rec = gd.enemy(key);
  if (rec) {
    let text = '';
    try { text = JSON.stringify(rec); } catch { text = ''; }
    for (const k of text.match(ENEMY_KEY_RE) || []) if (k !== key && gd.enemy(k)) out.add(k);
  }
  const list = [...out];
  m.set(key, list);
  return list;
}

/**
 * How many `child` enemies one `parent` can leave behind, when its data says so: a talent naming the child
 * (`<X>.enemy_key`) with a count (`<X>.cnt`, e.g. 磨砻 DeadSpawn 2, 烹泉 4, 沉沙's unconsumed blades ≤ 4) or without one
 * (DeathRattle: the 术师 of a 术师快艇 = 1) — the sim's kitDeathSpawn / kitBlades / DeathRattle kits. null when the data
 * gives no such bound (periodic summoners such as 枯朽萃聚使徒's BornBugs, keys a record merely mentions).
 */
function offspringPerParent(gd?: any, parent?: any, child?: any) : any {
  const rec = gd && typeof gd.enemy === 'function' ? gd.enemy(parent) : null;
  const t = rec && rec.talents && typeof rec.talents === 'object' ? rec.talents : null;
  if (!t || !t.bbStr || typeof t.bbStr !== 'object') return null;
  let n: any = null;
  for (const [k, v] of entriesOf(t.bbStr)) {
    if (v !== child || !k.endsWith('.enemy_key')) continue;
    const prefix = k.slice(0, -'.enemy_key'.length);
    const cnt = Number(t.bb && t.bb[`${prefix}.cnt`]);
    if (Number.isFinite(cnt) && cnt > 0) n = (n || 0) + Math.max(1, Math.ceil(cnt));
    else if (prefix === 'DeathRattle') n = (n || 0) + 1;
    else return null; // a countless summon talent (a boss's endless 余音): no bound from data
  }
  return n;
}

const summonCache = new WeakMap();
function summonIndex(gd?: any) : any {
  let idx = summonCache.get(gd);
  if (idx) return idx;
  idx = { byOwner: new Map(), ownerless: [] };
  const tokens = gd.raw && gd.raw.tokens && typeof gd.raw.tokens === 'object' ? gd.raw.tokens : {};
  for (const [id, t] of entriesOf(tokens)) {
    const owners = t && Array.isArray(t.owners) ? t.owners : [];
    if (!owners.length) idx.ownerless.push(id);
    for (const o of owners) { if (!idx.byOwner.has(o)) idx.byOwner.set(o, []); idx.byOwner.get(o).push(id); }
  }
  summonCache.set(gd, idx);
  return idx;
}
/** Summon (token) ids a chess (normal or elite) can create: its data `tokens` + tokens naming it an owner. */
function summonsOf(gd?: any, chessId?: any) : any {
  if (typeof gd.chess !== 'function' || typeof chessId !== 'string') return [];
  const rec = gd.chess(chessId);
  const out: any = new Set(rec && Array.isArray(rec.tokens) ? rec.tokens : []);
  const idx = summonIndex(gd);
  for (const id of [chessId, rec && rec.baseId, rec && rec.goldenId]) for (const t of (id && idx.byOwner.get(id)) || []) out.add(t);
  return [...out];
}
/** Summons no chess owns (bond / band units every player may field: 炎佑, 预备干员-医疗, Touch). */
function ownerlessSummons(gd?: any) : any { return summonIndex(gd).ownerless; }

const WORD_RE = /[A-Za-z][A-Za-z0-9_]*/g;
const recJson = (rec?: any) : any => { try { return rec ? JSON.stringify(rec) : ''; } catch { return ''; } };

/**
 * Bonds an IN_BATTLE layer gain of this player can name: its bond snapshot (every bond its lineup counts), plus bonds
 * its band, its effects (机变 cards, 驻守 …), its units and their items mention (content grants layers to those —
 * e.g. 克莱门莎's <阿戈尔>, requireActive: false). Anything else is a forged gain.
 */
function layerBondsOf(p?: any, gd?: any) : any {
  const out: any = new Set(Object.keys(p.bonds && typeof p.bonds === 'object' ? p.bonds : {}));
  if (typeof gd.bond !== 'function') return out;
  const texts = [recJson(p.playerEffects), recJson(p.bonds)];
  const band = p.bandId && typeof gd.band === 'function' ? gd.band(p.bandId) : null;
  if (band) {
    texts.push(recJson(band));
    if (band.effectId && typeof gd.effect === 'function') texts.push(recJson(gd.effect(band.effectId)));
  }
  for (const u of Array.isArray(p.units) ? p.units : []) {
    if (!u) continue;
    if (u.kind === 'token') { if (typeof gd.token === 'function') texts.push(recJson(gd.token(u.tokenId))); continue; }
    if (typeof gd.chess === 'function') texts.push(recJson(gd.chess(u.chessId)));
    for (const it of Array.isArray(u.items) ? u.items : []) if (typeof gd.item === 'function') texts.push(recJson(gd.item(it)));
  }
  for (const t of texts) for (const w of t.match(WORD_RE) || []) if (!out.has(w) && gd.bond(w)) out.add(w);
  return out;
}

/**
 * What the player's IN_BATTLE layer 特质 can add to each bond in one battle on top of the flat 60 + 4·round (DESIGN
 * §21.26): the traits of its units (garrisons with `bond_add_count` / `bond_add_count_multi`) and the ones their ADD_BOND
 * traits hand out (`give_garrison_id`, counted for every operator of the player — "所有【X】" reaches them all), each on
 * the bonds it names (`bond_by_id` ids; `bond_self` / `bond_actived_maxstack`: every bond of the player's snapshot and
 * units), up to the per-battle cap the sim applies (content/garrisons/battle.js: `max_add_count_per_battle`, the handed-out
 * 华法琳 trait's GRANTED_CAP_OVERRIDE). A trait the data gives no cap (初雪 / 银灰's freeze trait, 菲莱 / 百炼嘉维尔's per-skill
 * 萨尔贡, 斯卡蒂's per-kill …) — or a 魔王, whose +extra on every trait gain counts toward no cap — leaves its bonds bounded
 * only by the room under 999 (Infinity here): such boards legitimately gain hundreds of layers a battle.
 * @returns {Map<string, number>} bondId → extra allowance (Infinity: uncapped)
 */
function layerAllowanceOf(p?: any, gd?: any) : any {
  const out: any = new Map();
  if (typeof gd.garrison !== 'function' || typeof gd.chess !== 'function' || typeof gd.bond !== 'function') return out;
  const units = (Array.isArray(p.units) ? p.units : []).filter((u?: any) : any => u && u.kind !== 'token' && typeof u.chessId === 'string');
  const lineup: any = new Set(Object.keys(p.bonds && typeof p.bonds === 'object' ? p.bonds : {}));
  for (const u of units) for (const b of gd.chess(u.chessId)?.bonds || []) lineup.add(b);
  let extra = false;
  const credit = (g?: any, times?: any, handedOut?: any) : any => {
    const bb = g.bb || {};
    if (Number.isFinite(bb.extra_cnt)) { extra = true; return; }
    if (!Number.isFinite(bb.bond_add_count) && !Number.isFinite(bb.bond_add_count_multi)) return;
    const s = g.bbStr || {};
    const bonds = s.bond_type === 'bond_by_id' ? String(s.bond_id ?? '').split(',').map((x?: any) : any => x.trim()).filter((x?: any) : any => gd.bond(x)) : [...lineup];
    const override = handedOut ? GRANTED_CAP_OVERRIDE[g.garrisonId] : undefined;
    const cap = override ?? (Number(bb.max_add_count_per_battle) > 0 ? Number(bb.max_add_count_per_battle) : Infinity);
    for (const b of bonds) out.set(b, (out.get(b) || 0) + cap * times);
  };
  for (const u of units) {
    for (const gid of gd.chess(u.chessId)?.garrisonIds || []) {
      const g = gd.garrison(gid);
      if (!g || g.eventType !== 'IN_BATTLE') continue;
      if (g.effectKey !== 'ADD_BOND') { credit(g, 1, false); continue; }
      const given = gd.garrison(g.bbStr?.give_garrison_id);
      if (given && given.eventType === 'IN_BATTLE') credit(given, units.length, true);
    }
  }
  if (extra) for (const b of out.keys()) out.set(b, Infinity);
  return out;
}

/**
 * Bounds of a battle derived from its spec: spawn counts per enemy key, keys content may add, bounty coins, the
 * player ids and each player's unit uids.
 */
export function specBounds(spec: any, gd: any = null) : any {
  const keyCounts: any = new Map();
  /** `${enemyKey}|${sourcePlayerId}` → scheduled count (联防: whose leak re-enters) */
  const keySourceCounts: any = new Map();
  /** spawn keys whose schedule entries may leak without costing LP (countInTotal false, boss / part tags) */
  const uncountedKeys: any = new Set();
  let spawnCount = 0;
  let bountyCoins = 0;
  const sources: any = new Set();
  for (const s of Array.isArray(spec && spec.spawns) ? spec.spawns : []) {
    if (!s || typeof s.enemyKey !== 'string') continue;
    const n = Math.max(1, Math.min(10_000, Math.floor(Number(s.count) || 1)));
    spawnCount += n;
    keyCounts.set(s.enemyKey, (keyCounts.get(s.enemyKey) || 0) + n);
    const ks = `${s.enemyKey}|${typeof s.sourcePlayerId === 'string' ? s.sourcePlayerId : ''}`;
    keySourceCounts.set(ks, (keySourceCounts.get(ks) || 0) + n);
    if (s.countInTotal === false || s.tag === 'boss' || s.tag === 'part') uncountedKeys.add(s.enemyKey);
    const coins = Math.max(Number(s.bounty && s.bounty.coins) || 0, Number(s.mods && s.mods.bountyCoins) || 0);
    if (coins > 0) bountyCoins += coins * n;
    if (typeof s.sourcePlayerId === 'string') sources.add(s.sourcePlayerId);
  }
  const derived: any = new Set();
  for (const k of keyCounts.keys()) for (const d of derivedKeys(gd, k)) derived.add(d);
  const maxTotal = spawnCount * 4 + 100;
  // 联防: `${childKey}|${sourcePlayerId}` → how many content-spawned children the enemies that leaker sent in can leave
  // (offspringPerParent per parent; maxTotal when the data gives no bound) — a survivor of a split / summon is billed
  // only to a leaker whose own enemies can have produced it
  const derivedSourceCounts: any = new Map();
  for (const s of Array.isArray(spec && spec.spawns) ? spec.spawns : []) {
    if (!s || typeof s.enemyKey !== 'string' || typeof s.sourcePlayerId !== 'string') continue;
    const n = Math.max(1, Math.min(10_000, Math.floor(Number(s.count) || 1)));
    for (const d of derivedKeys(gd, s.enemyKey)) {
      const per = offspringPerParent(gd, s.enemyKey, d);
      const ks = `${d}|${s.sourcePlayerId}`;
      derivedSourceCounts.set(ks, Math.min(maxTotal, (derivedSourceCounts.get(ks) || 0) + (per == null ? maxTotal : n * per)));
    }
  }
  for (const k of keyCounts.keys()) {
    const rec = gd && typeof gd.enemy === 'function' ? gd.enemy(k) : null;
    if (rec && rec.notCountInTotal) uncountedKeys.add(k);
  }
  const players: any = new Map();
  for (const p of Array.isArray(spec && spec.players) ? spec.players : []) {
    if (!p || typeof p.playerId !== 'string') continue;
    const chess: any = new Map();
    const all: any = new Map();
    // unit types this player can field: its board's chess / tokens, their summons, and the ownerless summons of
    // bonds / bands (炎佑, 预备干员) — the only names a statistic of a unit created in battle (no board uid) may carry
    const defIds: any = new Set(gd ? ownerlessSummons(gd) : []);
    for (const u of Array.isArray(p.units) ? p.units : []) {
      if (!u || !Number.isInteger(u.uid)) continue;
      const defId = u.kind === 'token' ? u.tokenId : u.chessId;
      all.set(u.uid, defId);
      if (typeof defId === 'string') defIds.add(defId);
      if (u.kind !== 'token') {
        chess.set(u.uid, defId);
        if (gd) for (const t of summonsOf(gd, defId)) defIds.add(t);
      }
    }
    // the layers each bond starts the battle with (PlayerBattleInput.bonds): a gain never passes BOND_LAYER_CAP
    const startLayers: any = new Map();
    for (const [id, b] of entriesOf(p.bonds && typeof p.bonds === 'object' ? p.bonds : {})) {
      const v = Number(b && b.layers);
      if (Number.isFinite(v) && v > 0) startLayers.set(id, v);
    }
    players.set(p.playerId, { chess, all, defIds, bonds: gd ? layerBondsOf(p, gd) : null, startLayers, layerAllow: gd ? layerAllowanceOf(p, gd) : new Map() });
  }
  const round = Number(spec && spec.round) || 0;
  return {
    keyCounts, keySourceCounts, derivedSourceCounts, uncountedKeys, derived, spawnCount, bountyCoins, sources, players,
    // content spawns (splits, summons, boss minions) can add enemies beyond the schedule
    maxTotal,
    layerCap: 60 + 4 * round,
    maxTime: spec && spec.timeLimit > 0 ? spec.timeLimit + 5 : HARD_CAP_SECONDS,
  };
}

/**
 * 联防: the most enemies settlement can bill each leaker — what it sent in plus what those enemies can leave behind
 * (splits / summons within offspringPerParent, maxTotal without a data bound): validateClientResult's (key, leaker)
 * budgets summed per leaker. Bounds the live counter (Match._uniteLeft; user playtest #6 item 7).
 * @param {object[]} spawns the 联防 spawns (unite.js plan.leaked: { enemyKey, sourcePlayerId, … })
 * @returns {Map<string, number>} leaker id → bound
 */
export function uniteBillBounds(spawns: any, gd: any = null) : any {
  const B = specBounds({ spawns: Array.isArray(spawns) ? spawns : [] }, gd);
  const out: any = new Map();
  for (const [ks, n] of [...B.keySourceCounts, ...B.derivedSourceCounts]) {
    const pid = ks.slice(ks.lastIndexOf('|') + 1);
    if (pid) out.set(pid, (out.get(pid) || 0) + n);
  }
  return out;
}

const finiteIn = (v?: any, lo?: any, hi?: any) : any => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const sameMods = (a?: any, b?: any) : any => {
  const ka = a && typeof a === 'object' ? Object.keys(a).filter((k?: any) : any => a[k] !== undefined).sort() : [];
  const kb = b && typeof b === 'object' ? Object.keys(b).filter((k?: any) : any => b[k] !== undefined).sort() : [];
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i] || a[ka[i]] !== b[kb[i]]) return false;
  return true;
};

/**
 * Semantic validation of a client's BattleResult against the battle's spec (DESIGN §14 "Result validation"). The
 * payload already passed shared/protocol.js isBattleResult (types, sizes). Checks: every spec player reported and
 * nobody else; killed ≤ total ≤ bound; each leaked enemy key exists in the spawns (multiset bound; keys content may
 * spawn are bounded by the total) — boss fields excepted (their leaks cost team LP through b.progress); a leak is
 * `counted: false` only for enemies that never count (data notCountInTotal, countInTotal false, boss / part entries,
 * content spawns); 联防: leaks + never-spawned re-entries per (enemy, leaker) ≤ what that leaker sent in, and a split /
 * summon only on a leaker who sent in its parent, ≤ the parents' data offspring count (offspringPerParent); per-bond layer
 * gains ≤ 60 + 4·round + what the player's layer 特质 can add to that bond (layerAllowanceOf: their per-battle caps, no
 * flat bound when one is uncapped) and ≤ the room left under BOND_LAYER_CAP (999) from the bond's starting layers, only
 * on bonds the player's lineup / band / effects / items name, none when the spec disables gains; coins ≤ the spawns' bounty coins;
 * perfect consistent with the counted leaks; unit states only for the player's own units, within range.
 * @returns {{ ok: true, result: object } | { ok: false, reason: string }}
 */
export function validateClientResult(spec: any, raw: any, { gd = null }: any = {}) : any {
  const bad = (reason?: any) : any => ({ ok: false, reason });
  try {
    if (!spec || !raw || typeof raw !== 'object' || !raw.perPlayer || typeof raw.perPlayer !== 'object') return bad('shape');
    const B = specBounds(spec, gd);
    const bossLike = spec.kind === 'boss' || spec.kind === 'hidden';
    if (!['cleared', 'timeout', 'forced'].includes(raw.reason)) return bad('reason');
    if (!finiteIn(raw.time, 0, B.maxTime)) return bad('time');
    const pids = Object.keys(raw.perPlayer);
    if (pids.length !== B.players.size || pids.some((pid?: any) : any => !B.players.has(pid))) return bad('players');
    const spawnMods: any = new Map();
    for (const s of spec.spawns || []) {
      if (!s || typeof s.enemyKey !== 'string') continue;
      if (!spawnMods.has(s.enemyKey)) spawnMods.set(s.enemyKey, []);
      spawnMods.get(s.enemyKey).push(s);
    }
    const leakCount: any = new Map();
    // 联防: (enemyKey, leaker) budget shared by the helpers' leaks and the never-spawned re-entries
    const sourceLeft: any = new Map(B.keySourceCounts);
    const derivedLeft: any = new Map(B.derivedSourceCounts);
    const takeFrom = (left?: any, key?: any, src?: any) : any => {
      const ks = `${key}|${src || ''}`;
      const n = left.get(ks) || 0;
      if (n <= 0) return false;
      left.set(ks, n - 1);
      return true;
    };
    const takeSource = (key?: any, src?: any) : any => takeFrom(sourceLeft, key, src);
    // a content-spawned enemy (split, summon): billed only to a leaker who sent in a parent, within its offspring bound
    const takeDerived = (key?: any, src?: any) : any => B.derived.has(key) && takeFrom(derivedLeft, key, src);
    let coinsSum = 0;
    const perPlayer: any = {};
    for (const pid of pids) {
      const p = raw.perPlayer[pid];
      if (!p || typeof p !== 'object') return bad('player');
      const own = B.players.get(pid);
      if (!Number.isInteger(p.killed) || !Number.isInteger(p.total) || p.killed < 0 || p.killed > p.total || p.total > B.maxTotal) return bad('counts');
      const leaked: any[] = [];
      for (const l of Array.isArray(p.leaked) ? p.leaked : []) {
        if (!l || typeof l.enemyKey !== 'string') return bad('leak');
        const key = l.enemyKey;
        if (gd && typeof gd.enemy === 'function' && !gd.enemy(key) && !B.keyCounts.has(key)) return bad('leak key');
        const counted = l.counted !== false;
        if (!bossLike) {
          if (!B.keyCounts.has(key) && !B.derived.has(key)) return bad('leak key');
          const n = (leakCount.get(key) || 0) + 1;
          leakCount.set(key, n);
          const bound = (B.keyCounts.get(key) || 0) + (B.derived.has(key) ? B.maxTotal : 0);
          if (n > bound) return bad('leak multiset');
          // a leak costs LP unless the enemy never counts (data notCountInTotal, countInTotal false, boss / part
          // entries); content-spawned keys (summons, splits) may carry their own flag
          if (!counted && !B.uncountedKeys.has(key) && !B.derived.has(key)) return bad('uncounted leak');
        }
        // mods / tag / source come from the spawn schedule (a leak re-enters 联防 with them). An enemy content spawned
        // (a split, a summon) carries its parent's mods — the round multipliers, a bounty id — so the leak's mods may
        // equal another schedule entry's: keep those (dropping them would re-enter it weaker and lose its bounty)
        const cands = spawnMods.get(key) || [];
        const match = cands.find((s?: any) : any => sameMods(s.mods ?? null, l.mods ?? null)) || null;
        const src = match || cands[0] || null;
        const parent = match ? null : (spec.spawns || []).find((s?: any) : any => s && typeof s.enemyKey === 'string' && sameMods(s.mods ?? null, l.mods ?? null)) || null;
        const modsOf = (s?: any) : any => (s && s.mods ? { ...s.mods } : null);
        const mods = match ? modsOf(match) : parent ? modsOf(parent) : modsOf(src);
        let sourcePlayerId = typeof l.sourcePlayerId === 'string' ? l.sourcePlayerId : null;
        if (spec.kind === 'unite') {
          if (!sourcePlayerId || !B.sources.has(sourcePlayerId)) sourcePlayerId = src && typeof src.sourcePlayerId === 'string' ? src.sourcePlayerId : null;
          // whose LP a surviving enemy costs: never more of (key, leaker) than that leaker sent into the 联防 — or, for a
          // split / summon, than the enemies that leaker sent in can leave behind
          if (!takeSource(key, sourcePlayerId) && !takeDerived(key, sourcePlayerId)) return bad('leak source');
        } else if (sourcePlayerId !== pid && !B.players.has(sourcePlayerId)) sourcePlayerId = pid;
        const lpr = finiteIn(l.lpr, 0, 1000) ? l.lpr : 1;
        const e: any = { enemyKey: key, mods, lpr, sourcePlayerId, tag: src ? (src.tag ?? null) : (typeof l.tag === 'string' ? l.tag : null), counted, spawned: true };
        if (l.boss) e.boss = true;
        leaked.push(e);
      }
      const countedLeaks = leaked.filter((l?: any) : any => l.counted !== false).length;
      if (!bossLike && countedLeaks > p.total + B.spawnCount) return bad('leaks > total');
      if (typeof p.perfect !== 'boolean' || p.perfect !== (countedLeaks === 0)) return bad('perfect');
      const layerGains: any = {};
      for (const [bondId, n] of entriesOf(p.layerGains || {})) {
        // ≤ 60 + 4·round + what the player's layer 特质 can add to the bond (layerAllowanceOf; uncapped ones: no flat
        // bound), and never past BOND_LAYER_CAP from the layers the bond started with (Battle.addLayers clamps)
        const bound = Math.min(B.layerCap + (own.layerAllow.get(bondId) || 0), layerGainRoom(own.startLayers.get(bondId) || 0, Infinity));
        if (!finiteIn(n, 0, bound)) return bad('layer bound');
        if (n > 0 && spec.flags && spec.flags.layerGainsEnabled === false) return bad('layers disabled');
        if (gd && typeof gd.bond === 'function' && !gd.bond(bondId)) return bad('bond');
        if (n > 0 && own.bonds && !own.bonds.has(bondId)) return bad('layer bond');
        if (n > 0) layerGains[bondId] = n;
      }
      const coins = Number(p.coins) || 0;
      if (!finiteIn(coins, 0, B.bountyCoins + 1e-6)) return bad('coins');
      coinsSum += coins;
      const unitsEnd: any[] = [];
      const seen: any = new Set();
      for (const u of Array.isArray(p.unitsEnd) ? p.unitsEnd : []) {
        // units the sim created during the battle (no board uid) or not on this player's board carry nothing the match uses
        // (the board's operators and summon pieces: 联防 carries an operator's HP ratio and SP, a summon's SP — unite.js)
        if (!u || !Number.isInteger(u.uid) || !own.all.has(u.uid) || seen.has(u.uid)) continue;
        seen.add(u.uid);
        if (!finiteIn(u.hpPct, 0, 1) || !finiteIn(u.sp, 0, 1e5)) return bad('unit state');
        unitsEnd.push({ uid: u.uid, defId: own.all.get(u.uid), hpPct: u.hpPct, sp: u.sp, skillActive: !!u.skillActive, alive: !!u.alive && u.hpPct > 0 });
      }
      const unitStats: any[] = [];
      for (const u of Array.isArray(p.unitStats) ? p.unitStats : []) {
        if (!u) continue;
        const onBoard = Number.isInteger(u.uid) && own.all.has(u.uid);
        const defId = onBoard ? own.all.get(u.uid) : (typeof u.defId === 'string' ? u.defId : null);
        if (!defId) continue;
        // a unit created in battle (summon) is one this player's lineup can field — never another player's operator
        if (!onBoard && gd && !own.defIds.has(defId)) continue;
        const rec = gd ? (gd.chess?.(defId) || gd.token?.(defId)) : null;
        if (gd && !rec) continue;
        unitStats.push({
          uid: Number.isInteger(u.uid) ? u.uid : null, defId, name: rec && typeof rec.name === 'string' ? rec.name : defId, kind: u.kind === 'token' ? 'token' : 'op',
          dmg: Math.max(0, Number(u.dmg) || 0), kills: Math.max(0, Math.trunc(Number(u.kills) || 0)), heal: Math.max(0, Number(u.heal) || 0),
          taken: Math.max(0, Number(u.taken) || 0), attacks: Math.max(0, Math.trunc(Number(u.attacks) || 0)),
        });
      }
      const stat = (v?: any) : any => (finiteIn(v, 0, 1e13) ? v : 0);
      perPlayer[pid] = {
        killed: p.killed, total: p.total, leaked, perfect: countedLeaks === 0, layerGains, coins,
        damageDealt: stat(p.damageDealt), bossDamage: stat(p.bossDamage), healingDone: stat(p.healingDone), deaths: Math.trunc(stat(p.deaths)),
        unitsEnd, unitStats,
      };
    }
    if (coinsSum > B.bountyCoins + 1e-6) return bad('coins');
    const result: any = { time: raw.time, reason: raw.reason, perPlayer, killed: 0, total: 0, errors: Math.max(0, Math.trunc(Number(raw.errors) || 0)) };
    for (const pid of pids) { result.killed += perPlayer[pid].killed; result.total += perPlayer[pid].total; }
    if (spec.kind === 'unite' && Array.isArray(raw.unspawned)) {
      const unspawned: any[] = [];
      for (const u of raw.unspawned) {
        if (!u || typeof u.enemyKey !== 'string' || !B.keyCounts.has(u.enemyKey)) return bad('unspawned');
        const src = typeof u.sourcePlayerId === 'string' && B.sources.has(u.sourcePlayerId) ? u.sourcePlayerId : null;
        if (!takeSource(u.enemyKey, src)) return bad('unspawned source');
        unspawned.push({ enemyKey: u.enemyKey, sourcePlayerId: src, tag: typeof u.tag === 'string' ? u.tag : null, time: Number(u.time) || 0 });
      }
      if (unspawned.length > B.spawnCount) return bad('unspawned');
      if (unspawned.length) result.unspawned = unspawned;
    }
    return { ok: true, result };
  } catch (e: any) {
    return bad(`exception: ${e && e.message}`);
  }
}

const BOSS_POOL_MIN_HP = 1;
// server/sim/spec.js — BattleSpec: the JSON description of one battle, built by the server and simulated identically
// by the server (headless / takeover / verification) and by browsers (the authoritative client and display replicas).
// DESIGN §14. Pure ESM (served at /sim/spec.js): no Node API.
//
//   const spec = buildBattleSpec({ battleId, fieldId, kind, seed, modeId, round, stageId, rect, timeLimit, players,
//                                  spawns, routes, flags, enemyOverrides, waveId, bossId, content, boss })
//   const battle = createBattleFromSpec(spec, dataSource, { sharedBoss?, BattleClass?, logger?, recordEvents?, quiet? })
//
// A spec is JSON-safe by construction (it IS the JSON round trip of its inputs: `undefined` / functions vanish,
// Infinity / NaN become null), so the server builds its own battles from exactly what the clients receive. Object
// references (stage records, the shared boss pool, the data source) never travel: `stageId` names the stage, `boss`
// carries the pool numbers at battle start and the side that runs the battle attaches a pool object:
//   * server: the match's SharedBossPool (or a crediting wrapper on takeover, server/match/finalAssault.js),
//   * client: a LocalBossPool (below) reconciled with the server's `b.pool` broadcasts.
// Determinism: the sim uses no wall clock and no Math.random; the same spec + the same data give the same result on
// every machine (test/match/clientCombat.test.js compares result digests).
//
// Operator loadouts (DESIGN §16): every operator entry of `players[].units[]` may carry `skillIndex` (character skill
// slot, 0-based) and `moduleId` (uniEquipId or 'none'); buildBattleSpec keeps them when well-formed (else drops them =
// the default). createBattleFromSpec hands the Battle a per-battle data view (withUnitLoadouts) that resolves each
// operator def — and its summons — for the loadout of its chess (simdata getChess(id, loadout) / getToken(id, owner,
// ownerLoadout)); an explicit loadout argument always wins over the view's per-chess lookup.


export const SPEC_VERSION: any = 1;

/** Deep JSON round trip (exactly what a spec becomes on the wire). */
export function jsonClone(v: any) : any {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v));
}

// JSON has no Infinity: ±Infinity inputs become ±1e308 (still "larger than anything" for the sim's comparisons and
// caps) instead of null (which the sim would read as 0); NaN becomes null (the sim treats both as "missing").
const INF = 1e308;
const specReplacer = (_k?: any, v?: any) : any => (typeof v === 'number' && !Number.isFinite(v) ? (Number.isNaN(v) ? null : v > 0 ? INF : -INF) : v);

/**
 * Build the JSON BattleSpec of one field (DESIGN §14). Inputs are the Battle options the match computed (DESIGN §5.1)
 * minus object references: `stageId` instead of a stage object, `boss: { poolHp, poolMax }` instead of a pool.
 * @returns {object} a fresh JSON-safe object
 */
export function buildBattleSpec(o: any = {}) : any {
  const bossLike = o.kind === 'boss' || o.kind === 'hidden';
  const tl = Number(o.timeLimit);
  const spec: any = {
    v: SPEC_VERSION,
    battleId: o.battleId ?? null,
    fieldId: o.fieldId ?? null,
    kind: o.kind ?? 'normal',
    seed: (Number(o.seed) >>> 0) || 1,
    modeId: o.modeId ?? null,
    round: Number.isInteger(o.round) ? o.round : 0,
    stageId: o.stageId ?? null,
    rect: o.rect ?? null,
    // boss / hidden fields end by the shared pool or the match (null = no limit)
    timeLimit: !bossLike && tl > 0 && Number.isFinite(tl) ? tl : null,
    players: Array.isArray(o.players) ? o.players : [],
    // a spawn at time Infinity never happens and is not counted (Battle._queueSpawn): leave it out
    spawns: (Array.isArray(o.spawns) ? o.spawns : []).filter((x?: any) : any => !(x && Number(x.time) === Infinity)),
    routes: Array.isArray(o.routes) ? o.routes : [],
    flags: o.flags ?? {},
    enemyOverrides: o.enemyOverrides ?? {},
    waveId: o.waveId ?? null,
    bossId: o.bossId ?? null,
    content: o.content ?? 'full',
    boss: bossLike && o.boss ? { poolHp: Number(o.boss.poolHp) || 0, poolMax: Number(o.boss.poolMax) || 1 } : null,
  };
  const out = JSON.parse(JSON.stringify(spec, specReplacer));
  for (const p of out.players) for (const u of (p && Array.isArray(p.units) ? p.units : [])) if (u && typeof u === 'object') sanitizeUnitLoadout(u);
  return out;
}

const LOADOUT_ID = /^[A-Za-z0-9_\-]{1,64}$/;

/** Keep a unit's `skillIndex` / `moduleId` only when well-formed (the data layer checks legality). Mutates `u`. */
export function sanitizeUnitLoadout(u: any) : any {
  if ('skillIndex' in u && !(Number.isInteger(u.skillIndex) && u.skillIndex >= 0 && u.skillIndex <= 9)) delete u.skillIndex;
  if ('moduleId' in u && !(typeof u.moduleId === 'string' && LOADOUT_ID.test(u.moduleId))) delete u.moduleId;
  if (u.kind === 'token') { delete u.skillIndex; delete u.moduleId; }
  return u;
}

// withUnitLoadouts(ds, players) — the per-battle loadout data view — lives in simdata.js (content/index.js
// installContent applies it to every Battle, however constructed); re-exported here for spec users.

/**
 * Construct the Battle a spec describes. The spec is deep-copied (one spec may build several battles: a display
 * replica, a takeover re-simulation, a verification run).
 * @param {object} spec BattleSpec
 * @param {any} dataSource DataSource (or raw data maps; default: the sim's default source)
 * @param {{ sharedBoss?: object|null, BattleClass?: Function, logger?: object, recordEvents?: boolean, quiet?: boolean,
 *           content?: string }} [opts]
 */
export function createBattleFromSpec(spec: any, dataSource: any, opts: any = {}) : any {
  if (!spec || typeof spec !== 'object') throw new TypeError('createBattleFromSpec: spec required');
  const s = jsonClone(spec);
  const bossLike = s.kind === 'boss' || s.kind === 'hidden';
  let sharedBoss = opts.sharedBoss ?? null;
  if (!sharedBoss && bossLike && s.boss) sharedBoss = new LocalBossPool(s.boss.poolMax, s.boss.poolHp);
  const BattleClass = typeof opts.BattleClass === 'function' ? opts.BattleClass : FieldBattle;
  const battleOpts: any = {
    seed: s.seed,
    kind: s.kind,
    modeId: s.modeId,
    round: s.round,
    stageId: s.stageId,
    rect: s.rect ?? undefined,
    timeLimit: s.timeLimit == null ? (bossLike ? Infinity : undefined) : s.timeLimit,
    players: s.players ?? [],
    spawns: s.spawns ?? [],
    routes: s.routes ?? [],
    sharedBoss,
    flags: s.flags ?? {},
    fieldId: s.fieldId,
    enemyOverrides: s.enemyOverrides ?? {},
    waveId: s.waveId ?? null,
    data: dataSource,
    content: opts.content ?? s.content ?? 'full',
  };
  if (s.bossId != null) battleOpts.bossId = s.bossId;
  if (opts.logger) battleOpts.logger = opts.logger;
  if (opts.recordEvents === false) battleOpts.recordEvents = false;
  if (opts.quiet) battleOpts.quiet = true;
  const b = new BattleClass(battleOpts);
  b.battleId = s.battleId ?? null;
  return b;
}

/**
 * Client-side view of the shared boss HP pool (DESIGN §14 b.pool): the server owns the pool; this field adds its own
 * damage locally and shows `server hp − local damage the server has not acknowledged yet`.
 *   damage(playerId, amount)  called by the sim; returns the damage dealt (≤ the remaining displayed hp; the hit that
 *                             would leave less than BOSS_POOL_MIN_HP (1) takes the rest)
 *   sync(serverHp, ackedCum)  a b.pool broadcast: the server's hp and how much of THIS field's cumulative damage
 *                             (`cum`) it has already counted
 *   cum / byPlayer            cumulative damage of this field (reported as b.progress.bossDmg / .by)
 * `hp` below 1 reads 0 (the leader is down; user playtest #6 item 5): the difference of the server's float hp and the
 * local counters can leave dust (3.6e-12) smaller than half an ulp of `cum`, which no hit could remove — `cum += dust`
 * changes nothing — so the leader stood at "0 HP" and the field never ended.
 */
export class LocalBossPool {
  [key: string]: any
  constructor(maxHp: any, hp: any = maxHp) {
    this.maxHp = Math.max(1, Number(maxHp) || 1);
    const h = Number(hp);
    this.serverHp = Number.isFinite(h) ? Math.max(0, Math.min(this.maxHp, h)) : this.maxHp;
    this.cum = 0;
    this.acked = 0;
    /** @type {Record<string, number>} */
    this.byPlayer = {};
  }

  get hp() : any {
    const h = this.serverHp - Math.max(0, this.cum - this.acked);
    return h < BOSS_POOL_MIN_HP ? 0 : h;
  }

  /** Only used by the sim's fallback path when damage() throws. */
  set hp(v: any) {
    const n = Number(v);
    if (Number.isFinite(n)) this.serverHp = Math.max(0, n) + Math.max(0, this.cum - this.acked);
  }

  damage(playerId: any, amount: any) : any {
    const a = Number(amount);
    const left = this.hp;
    if (!Number.isFinite(a) || a <= 0 || left <= 0) return 0;
    const dealt = left - a < BOSS_POOL_MIN_HP ? left : a;
    this.cum += dealt;
    if (playerId != null) this.byPlayer[playerId] = (this.byPlayer[playerId] || 0) + dealt;
    return dealt;
  }

  sync(serverHp: any, ackedCum: any) : any {
    const h = Number(serverHp);
    if (Number.isFinite(h)) this.serverHp = Math.max(0, Math.min(this.maxHp, h));
    const a = Number(ackedCum);
    if (Number.isFinite(a) && a >= 0) this.acked = a;
  }
}

/**
 * LP meter of a battle: cumulative LP the field cost its team so far — enemy leaks weighted by `lpr` (data
 * lifePointReduce; 0 for harmless units, 1 when absent) plus leader "扣除目标生命" effects (the sim's 'lpLoss' hook).
 * Boss / hidden fields report it as b.progress.leaks; the server charges the team LP with the deltas.
 * @returns {{ lp: number, detach: () => void }}
 */
export function attachLpMeter(battle: any) : any {
  const meter: any = { lp: 0, detach() : any {} };
  if (!battle || typeof battle.on !== 'function') return meter;
  const h1 = battle.on('enemyLeak', (ctx?: any) : any => {
    const e = ctx && ctx.enemy;
    if (!e) return;
    const lpr = Number.isFinite(e.lpr) && e.lpr >= 0 ? e.lpr : 1;
    meter.lp += lpr;
  }, { priority: -1000, owner: 'lpMeter' });
  const h2 = battle.on('lpLoss', (ctx?: any) : any => {
    const n = Number(ctx && ctx.amount);
    if (Number.isFinite(n) && n > 0) meter.lp += n;
  }, { priority: -1000, owner: 'lpMeter' });
  meter.detach = () : any => { try { battle.off?.(h1); battle.off?.(h2); } catch { /* ignore */ } };
  return meter;
}

/**
 * 联防 (user playtest #6 item 7): each source player's enemies still standing on a unite field — not spawned yet,
 * alive, or already through the objective again — i.e. what settlement would charge them if the battle ended now
 * (server/match/unite.js uniteSurvivors: the unite result's counted leaks + unspawned entries by `sourcePlayerId`;
 * alive enemies become leaks on a timeout, keyed like Battle._recordLeak). It falls as the helpers strike them down and
 * rises when one splits or summons (content-spawned children inherit the parent's sourcePlayerId).
 * `{ [playerId]: n }` (a player with none left is absent), or null for a battle without the sim's state (a stand-in).
 * @returns {Record<string, number> | null}
 */
export function uniteLeft(battle: any) : any {
  if (!battle) return null;
  const out: any = {};
  const add = (pid?: any) : any => { if (typeof pid === 'string' && pid) out[pid] = (out[pid] || 0) + 1; };
  if (battle.finished && typeof battle.result === 'function') {
    const r = battle.result();
    if (!r || !r.perPlayer) return null;
    for (const pp of Object.values(r.perPlayer)) for (const l of (pp && pp.leaked) || []) if (l && l.counted !== false) add(l.sourcePlayerId);
    for (const u of r.unspawned || []) if (u) add(u.sourcePlayerId);
    return out;
  }
  if (!battle._perPlayer || !Array.isArray(battle._pending) || !Array.isArray(battle.enemies)) return null;
  for (const p of battle._pending) if (p) add(p.sourcePlayerId);
  for (const e of battle.enemies) if (e && e.alive && e.counted) add(e.sourcePlayerId ?? e.ownerId);
  for (const pp of Object.values(battle._perPlayer)) for (const l of (pp && pp.leaked) || []) if (l && l.counted !== false) add(l.sourcePlayerId);
  return out;
}

/**
 * Progress numbers of a battle for b.progress / the teammates' waiting UI: game time, kills, total, counted leaks
 * (normal / unite), the boss pool damage of this field and — unite fields — `left` (uniteLeft: each leaker's enemies
 * still standing).
 */
export function battleProgress(battle: any) : any {
  const r = battle && typeof battle.result === 'function' && battle.finished ? battle.result() : null;
  let leaks = 0;
  const pp = battle && battle._perPlayer ? battle._perPlayer : (r && r.perPlayer) || {};
  for (const k of Object.keys(pp)) for (const l of pp[k].leaked || []) if (l && l.counted !== false) leaks++;
  const pool = battle && battle.sharedBoss;
  const gt = Number(battle && battle.time) || 0;
  const out: any = {
    gt: Math.round(gt * 1000) / 1000,
    killed: Math.max(0, Math.trunc(Number(battle && battle.killed) || 0)),
    total: Math.max(0, Math.trunc(Number(battle && battle.total) || 0)),
    leaks,
    bossDmg: pool && Number.isFinite(pool.cum) ? pool.cum : 0,
    done: !!(battle && battle.finished),
  };
  if (battle && battle.kind === 'unite') {
    const left = uniteLeft(battle);
    if (left) out.left = left;
  }
  return out;
}

const r4 = (v?: any) : any => Math.round((Number(v) || 0) * 1e4) / 1e4;
const modsKey = (m?: any) : any => (m && typeof m === 'object' ? JSON.stringify(Object.keys(m).filter((k?: any) : any => m[k] !== undefined).sort().map((k?: any) : any => [k, m[k]])) : '');

/**
 * Canonical summary of a BattleResult (everything the match consumes): used to compare a client's result with the
 * server's re-simulation (SP_VERIFY) and by the determinism tests. Returns `{ json, hash }`.
 */
export function resultDigest(result: any) : any {
  const res = result && typeof result === 'object' ? result : {};
  const per = res.perPlayer && typeof res.perPlayer === 'object' ? res.perPlayer : {};
  const players = Object.keys(per).sort().map((pid?: any) : any => {
    const p = per[pid] || {};
    const lg = p.layerGains && typeof p.layerGains === 'object' ? p.layerGains : {};
    return [
      pid,
      p.killed | 0, p.total | 0, !!p.perfect, r4(p.coins),
      Object.keys(lg).sort().map((k?: any) : any => [k, r4(lg[k])]),
      // mods included: a leak re-enters the 联防 with them (round multipliers, bounty id)
      (Array.isArray(p.leaked) ? p.leaked : []).map((l?: any) : any => `${l && l.enemyKey}|${l && l.counted === false ? 0 : 1}|${(l && l.sourcePlayerId) || ''}|${modsKey(l && l.mods)}`).sort(),
      Math.round(Number(p.damageDealt) || 0), Math.round(Number(p.bossDamage) || 0),
      (Array.isArray(p.unitsEnd) ? p.unitsEnd : []).map((u?: any) : any => [u && u.uid, r4(u && u.hpPct), r4(u && u.sp), !!(u && u.alive)]),
    ];
  });
  const json = JSON.stringify([res.reason ?? null, r4(res.time), res.killed | 0, res.total | 0, players]);
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return { json, hash: h.toString(16).padStart(8, '0') };
}

const fnum = (v?: any, d : any= 0) : any => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const cap = (list?: any, n?: any) : any => (Array.isArray(list) ? list.slice(0, n) : []);
const isKey = (v?: any) : any => typeof v === 'string' && v.length > 0 && v.length <= 64 && /^[A-Za-z0-9_\-.:]+$/.test(v);
const uidOr = (v?: any) : any => (Number.isInteger(v) && v >= 1 && v <= 2 ** 31 ? v : null);
const keyOr = (v?: any) : any => (isKey(v) ? v : null);

function compactMods(m?: any) : any {
  if (!m || typeof m !== 'object') return null;
  const out: any = {};
  let n = 0;
  for (const k of Object.keys(m)) {
    if (n >= 16 || k.length > 32) break;
    const v = m[k];
    if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 64) || v === null) { out[k] = v; n++; }
  }
  return out;
}

/**
 * The part of a BattleResult the server consumes, in the b.result wire shape (shared/protocol.js isBattleResult):
 * numbers only where the match reads them, list sizes capped, names dropped (the server names units from its data).
 */
export function compactResult(res: any) : any {
  const r = res && typeof res === 'object' ? res : {};
  const perPlayer: any = {};
  for (const pid of Object.keys(r.perPlayer || {}).slice(0, 4)) {
    const p = r.perPlayer[pid] || {};
    const layerGains: any = {};
    for (const [k, v] of entriesOf(p.layerGains || {}).slice(0, 40)) if (isKey(k) && fnum(v) > 0) layerGains[k] = Math.min(1e4, fnum(v));
    const total = Math.max(0, Math.trunc(fnum(p.total)));
    perPlayer[pid] = {
      killed: Math.min(total, Math.max(0, Math.trunc(fnum(p.killed)))),
      total,
      leaked: cap(p.leaked, 400).filter((l?: any) : any => l && isKey(l.enemyKey)).map((l?: any) : any => {
        const o: any = { enemyKey: l.enemyKey, mods: compactMods(l.mods), lpr: Math.max(0, Math.min(1000, fnum(l.lpr, 1))), sourcePlayerId: keyOr(l.sourcePlayerId), tag: typeof l.tag === 'string' && l.tag.length <= 16 ? l.tag : null, counted: l.counted !== false };
        if (l.boss) o.boss = true;
        if (l.spawned) o.spawned = true;
        return o;
      }),
      perfect: !!p.perfect,
      layerGains,
      coins: Math.max(0, fnum(p.coins)),
      damageDealt: Math.max(0, Math.round(fnum(p.damageDealt))),
      bossDamage: Math.max(0, Math.round(fnum(p.bossDamage))),
      healingDone: Math.max(0, Math.round(fnum(p.healingDone))),
      deaths: Math.max(0, Math.trunc(fnum(p.deaths))),
      unitsEnd: cap(p.unitsEnd, 64).filter(Boolean).map((u?: any) : any => ({
        uid: uidOr(u.uid), defId: keyOr(u.defId), hpPct: Math.max(0, Math.min(1, fnum(u.hpPct))), sp: Math.max(0, Math.min(1e5, fnum(u.sp))),
        skillActive: !!u.skillActive, alive: !!u.alive,
      })),
      unitStats: cap(p.unitStats, 160).filter(Boolean).map((u?: any) : any => ({
        uid: uidOr(u.uid), defId: keyOr(u.defId), kind: typeof u.kind === 'string' && u.kind.length <= 16 ? u.kind : 'op',
        dmg: Math.max(0, Math.round(fnum(u.dmg))), kills: Math.max(0, Math.trunc(fnum(u.kills))), heal: Math.max(0, Math.round(fnum(u.heal))),
        taken: Math.max(0, Math.round(fnum(u.taken))), attacks: Math.max(0, Math.trunc(fnum(u.attacks))),
      })),
    };
  }
  const out: any = {
    reason: ['cleared', 'timeout', 'forced'].includes(r.reason) ? r.reason : 'forced',
    time: Math.max(0, Math.min(1e5, fnum(r.time))),
    killed: Math.max(0, Math.trunc(fnum(r.killed))),
    total: Math.max(0, Math.trunc(fnum(r.total))),
    perPlayer,
    errors: Math.max(0, Math.min(1e9, Math.trunc(fnum(r.errors)))),
  };
  if (out.killed > out.total) out.killed = out.total;
  if (Array.isArray(r.unspawned) && r.unspawned.length) {
    out.unspawned = cap(r.unspawned, 400).filter((u?: any) : any => u && isKey(u.enemyKey)).map((u?: any) : any => ({
      enemyKey: u.enemyKey, sourcePlayerId: keyOr(u.sourcePlayerId), tag: typeof u.tag === 'string' && u.tag.length <= 16 ? u.tag : null,
      time: Math.max(0, Math.min(1e6, fnum(u.time))),
    }));
  }
  return out;
}

/** Bytes a b.result frame may use (the socket's inbound limit is 64 KB; headroom for the envelope). */
export const RESULT_FRAME_BUDGET: any = 60 * 1024;

/**
 * Keep a compact result under the frame budget (a larger frame closes the socket: the server would take the field over
 * at the very end). Never touches what settles LP / funds / layers of a normal field. In order: drop the per-unit
 * statistics, drop the leaks' `mods` (the server rebuilds them from the spec), and — boss fields only, whose leaks cost
 * team LP through b.progress — drop leak entries. Returns the (possibly) trimmed copy.
 * @param {object} result compactResult(...) output
 * @param {{ bossLike?: boolean, budget?: number, battleId?: string }} [o]
 */
export function fitResult(result: any, { bossLike = false, budget = RESULT_FRAME_BUDGET, battleId = '' }: any = {}) : any {
  const size = (r?: any) : any => JSON.stringify({ t: 'b.result', battleId, result: r, rid: 2147483647 }).length;
  if (!result || typeof result !== 'object' || size(result) <= budget) return result;
  const r: any = { ...result, perPlayer: {} };
  for (const [pid, p] of entriesOf(result.perPlayer || {})) r.perPlayer[pid] = { ...p, unitStats: [] };
  if (size(r) <= budget) return r;
  for (const p of Object.values(r.perPlayer)) p.leaked = (p.leaked || []).map((l?: any) : any => ({ ...l, mods: null }));
  if (size(r) <= budget || !bossLike) return r;
  for (const p of Object.values(r.perPlayer)) p.leaked = [];
  if (Array.isArray(r.unspawned)) r.unspawned = [];
  return r;
}

/** Steps a mission-core battle built from the field options. Settlement reads result().perPlayer. The core result only records finished and winner; this ledger fills killed, leaks, damage, healing and deaths from the events the battle emits. */
export class FieldBattle {
  [key: string]: any
  opts: any
  kind: any
  fieldId: any
  time: number
  tickCount: number
  finished: boolean
  reason: string | null
  errorCount: number
  errors: any[]
  killed: number
  total: number
  sharedBoss: any
  battleId: string | null
  players: any
  spawns: any
  private core: any
  ledger: Map<string, any>
  lastHit: Map<string, string>
  constructor(opts: any = {}) {
    this.opts = opts ?? {}
    this.kind = opts?.kind ?? "normal"
    this.fieldId = opts?.fieldId ?? null
    this.players = opts?.players ?? []
    this.spawns = opts?.spawns ?? []
    this.sharedBoss = opts?.sharedBoss ?? null
    this.time = 0
    this.tickCount = 0
    this.finished = false
    this.reason = null
    this.errorCount = 0
    this.errors = []
    this.killed = 0
    this.total = 0
    this.battleId = null
    this.core = null
    this.ledger = new Map()
    this.lastHit = new Map()
    const limit = Number(opts?.timeLimit)
    this.timeLimit = Number.isFinite(limit) && limit > 0 ? limit : Infinity
    try {
      const spec = missionSpec(opts)
      if (spec) {
        this.total = Number(opts._countedEnemies) || 0
        const bridge = fieldBridge(this)
        const modules = [bridge, leakModule, ...contentModules()]
        spec.modules.push(...modules.map((module) => module.id))
        this.core = createBattle(spec, modules)
      }
    } catch (error) {
      this.errorCount += 1
      this.errors.push(error)
    }
  }
  on(name?: any, fn?: any): any {
    return { name, fn }
  }
  off(): void {}
  /** Deploy the board into `allyUnits` so a prep preview can read start-of-battle stats. */
  start(): void {
    if (this.allyUnits) return
    this.allyUnits = previewUnits(this.opts?.data, this.players)
  }
  step(): void {
    if (this.finished) return
    this.tickCount += 1
    this.time = this.tickCount * TICK
    if (this.core) {
      try { runSteps(this.core, 1) } catch (error) { this.errorCount += 1; this.errors.push(error) }
      if (this.core?.result().finished) { this.finish("cleared"); return }
    }
    if (this.sharedBoss && this.sharedBoss.hp <= 0) { this.finish("cleared"); return }
    if (this.time >= this.timeLimit - 1e-9) this.finish("timeout")
  }
  forceEnd(reason?: any): void {
    if (!this.finished) this.finish(reason === "timeout" ? "timeout" : "forced")
  }
  result(): any {
    const ids = new Set<string>()
    for (const player of Array.isArray(this.players) ? this.players : []) {
      if (typeof player?.playerId === "string") ids.add(player.playerId)
    }
    for (const id of this.ledger.keys()) ids.add(id)
    const perPlayer: Record<string, any> = {}
    for (const id of ids) {
      const row = this.ledger.get(id) ?? emptyPerPlayer()
      const dealt = this.sharedBoss?.byPlayer?.[id]
      if (typeof dealt === "number" && dealt > 0) row.bossDamage = dealt
      const leaks = Array.isArray(row.leaked) ? row.leaked.filter((item: { counted?: boolean }) => item && item.counted !== false).length : 0
      row.perfect = leaks === 0
      perPlayer[id] = row
    }
    return { time: this.time, reason: this.reason ?? "forced", perPlayer, killed: this.killed, total: this.total, errors: this.errorCount }
  }
  snapshot(): any {
    return { fieldId: this.fieldId, t: this.time, units: [], dp: 0, killed: this.killed, total: this.total }
  }
  drainEvents(): any[] { return [] }
  fieldMeta(): any {
    return { fieldId: this.fieldId, kind: this.kind, rect: this.opts?.rect ?? null, stageId: this.opts?.stageId ?? null, units: [] }
  }
  private finish(reason: string): void {
    this.finished = true
    this.reason = reason
  }
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function baseStats(stats: any): Record<string, number> {
  const source = stats && typeof stats === "object" ? stats : {}
  return {
    maxHp: finite(source.maxHp),
    atk: finite(source.atk),
    def: finite(source.def),
    res: finite(source.res),
    bat: finite(source.bat),
    aspd: finite(source.aspd, 100),
    blockCnt: finite(source.blockCnt),
    moveSpeed: finite(source.moveSpeed),
  }
}

/** Equipped items add their attack fraction and attack-speed delta. Fractions add, they do not multiply. */
function equipmentMods(data: any, itemIds: readonly string[]): { atk: number; aspd: number } {
  let atk = 0
  let aspd = 0
  const items = data?.items
  if (!items || typeof items !== "object") return { atk, aspd }
  for (const id of itemIds) {
    const params = items[id]?.params
    if (!params || typeof params !== "object") continue
    if (typeof params.atk === "number") atk += params.atk
    if (typeof params.attack_speed === "number") aspd += params.attack_speed
  }
  return { atk, aspd }
}

function previewOperator(data: any, unit: any): any | null {
  const chess = data?.chess?.[unit.chessId]
  if (!chess || !Number.isInteger(unit.uid)) return null
  const base = baseStats(chess.stats)
  const mods = equipmentMods(data, Array.isArray(unit.items) ? unit.items : [])
  const current = { ...base, atk: (base.atk ?? 0) * (1 + mods.atk), aspd: (base.aspd ?? 100) + mods.aspd }
  return {
    id: unit.uid,
    uid: unit.uid,
    kind: "op",
    side: "ally",
    defId: unit.chessId,
    hp: base.maxHp,
    alive: true,
    base,
    s: current,
    liveRangeGrid: chess.rangeGrid,
  }
}

function previewToken(data: any, unit: any): any | null {
  const token = data?.tokens?.[unit.tokenId]
  if (!token || !Number.isInteger(unit.uid)) return null
  const base = baseStats(token.stats)
  return {
    id: unit.uid,
    uid: unit.uid,
    kind: "token",
    side: "ally",
    defId: unit.tokenId,
    hp: base.maxHp,
    alive: true,
    base,
    s: base,
    liveRangeGrid: token.rangeGrid,
  }
}

function previewUnits(data: any, players: any): any[] {
  const units: any[] = []
  for (const player of Array.isArray(players) ? players : []) {
    for (const unit of Array.isArray(player?.units) ? player.units : []) {
      const built = unit?.kind === "token" ? previewToken(data, unit) : unit?.kind === "chess" ? previewOperator(data, unit) : null
      if (built) units.push(built)
    }
  }
  return units
}

function fieldBridge(battle: FieldBattle): MissionModule {
  return {
    id: "field:bridge",
    install(ctx) {
      ctx.registerSystem({
        id: "field-attack-clock",
        slot: "schedule",
        priority: 50,
        run(live) {
          for (const id of live.units()) {
            if (!live.timerView(id, "attack").started) live.startTimer(id, "attack")
          }
        },
      })
      ctx.subscribe("spawn", (event) => {
        const unitId = typeof event.data.unitId === "string" ? event.data.unitId : ""
        if (!unitId || ctx.unit(unitId)?.side !== "enemy" || ctx.script(unitId).counted === false) return
        const row = ledgerRow(battle, creditPlayer(battle, ctx.script(unitId).ownerId))
        if (row) row.total += 1
      })
      ctx.subscribe("damaged", (event) => {
        const targetId = typeof event.data.targetId === "string" ? event.data.targetId : ""
        if (!targetId) return
        const amount = Number(event.data.amount)
        const sourceId = typeof event.data.creditId === "string" ? event.data.creditId : typeof event.data.sourceId === "string" ? event.data.sourceId : ""
        const owner = sourceId ? ctx.script(sourceId).ownerId : ""
        if (ctx.unit(targetId)?.side === "enemy" && amount > 0) {
          if (typeof owner === "string" && owner) battle.lastHit.set(targetId, owner)
          const row = ledgerRow(battle, creditPlayer(battle, owner))
          if (row) row.damageDealt += amount
        }
        if (ctx.script(targetId).boss !== true || !battle.sharedBoss || !(amount > 0)) return
        battle.sharedBoss.damage(typeof owner === "string" && owner ? owner : null, amount)
      })
      ctx.subscribe("heal", (event) => {
        const amount = Number(event.data.amount)
        const sourceId = typeof event.data.sourceId === "string" ? event.data.sourceId : ""
        if (!(amount > 0) || !sourceId) return
        const row = ledgerRow(battle, creditPlayer(battle, ctx.script(sourceId).ownerId))
        if (row) row.healingDone += amount
      })
      ctx.subscribe("downed", (event) => {
        const unitId = typeof event.data.unitId === "string" ? event.data.unitId : ""
        if (!unitId) return
        const side = ctx.unit(unitId)?.side
        const script = ctx.script(unitId)
        if (side === "ally") {
          const row = ledgerRow(battle, creditPlayer(battle, script.ownerId))
          if (row) row.deaths += 1
          return
        }
        if (side !== "enemy" || script.counted === false) return
        battle.killed += 1
        const row = ledgerRow(battle, creditPlayer(battle, battle.lastHit.get(unitId) || script.ownerId))
        if (row) row.killed += 1
      })
      ctx.subscribe("leak", (event) => {
        const unitId = typeof event.data.unitId === "string" ? event.data.unitId : ""
        if (!unitId) return
        const script = ctx.script(unitId)
        const sourcePlayerId = creditPlayer(battle, script.ownerId)
        const row = ledgerRow(battle, sourcePlayerId)
        if (!row) return
        const entry: { enemyKey: string; sourcePlayerId: string; counted: boolean; lpr?: number } = {
          enemyKey: typeof script.chessId === "string" ? script.chessId : "",
          sourcePlayerId,
          counted: script.counted !== false,
        }
        if (typeof script.lpr === "number") entry.lpr = script.lpr
        row.leaked.push(entry)
      })
    },
  }
}

function solePlayerId(battle: FieldBattle): string {
  const players = Array.isArray(battle.players) ? battle.players : []
  return players.length === 1 && typeof players[0]?.playerId === "string" ? players[0].playerId : ""
}

function creditPlayer(battle: FieldBattle, owner: unknown): string {
  return typeof owner === "string" && owner.length > 0 ? owner : solePlayerId(battle)
}

function ledgerRow(battle: FieldBattle, playerId: string): { total: number; killed: number; leaked: unknown[]; damageDealt: number; healingDone: number; deaths: number; perfect: boolean } | null {
  if (!playerId) return null
  let row = battle.ledger.get(playerId)
  if (!row) {
    row = emptyPerPlayer()
    battle.ledger.set(playerId, row)
  }
  return row
}

function attributesOf(stats: any, hpScale = 1): Record<string, number> {
  const source = stats && typeof stats === "object" ? stats : {}
  const maxHp = Math.max(1, (Number(source.maxHp ?? source.hp) || 1) * hpScale)
  return {
    hp: maxHp,
    maxHp,
    atk: Number(source.atk) || 0,
    def: Number(source.def) || 0,
    res: Number(source.res) || 0,
    aspd: Number(source.aspd) || 100,
    bat: Number(source.bat) || 1,
    block: Number(source.blockCnt) || 0,
    moveSpeed: Number(source.moveSpeed) || 1,
  }
}

function rangeOf(grid: unknown): { x: number; y: number }[] {
  if (!Array.isArray(grid)) return [{ x: 1, y: 0 }]
  const cells: { x: number; y: number }[] = []
  for (const cell of grid) {
    if (!Array.isArray(cell) || cell.length < 2) continue
    const y = Number(cell[0])
    const x = Number(cell[1])
    if (Number.isFinite(x) && Number.isFinite(y)) cells.push({ x, y })
  }
  return cells.length > 0 ? cells : [{ x: 1, y: 0 }]
}

function allySpec(unit: any, ownerId: string, data: any): UnitSpec | null {
  if (!unit || unit.kind !== "chess" || typeof unit.chessId !== "string") return null
  const chess = data?.chess?.[unit.chessId]
  const stats = chess?.stats
  const col = Number(unit.col)
  const row = Number(unit.row)
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null
  const facing = unit.dir === "UP" || unit.dir === "DOWN" || unit.dir === "LEFT" || unit.dir === "RIGHT" ? unit.dir : "RIGHT"
  return {
    id: String(unit.uid ?? unit.chessId),
    side: "ally",
    kind: "operator",
    attributes: attributesOf(stats),
    skills: [],
    attackRange: rangeOf(chess?.rangeGrid),
    tags: ["op"],
    deployPositions: chess?.position === "RANGED" ? ["high", "ground"] : ["ground", "high"],
    x: col,
    y: row,
    facing,
    motion: "WALK",
    script: { kind: "op", chessId: unit.chessId, ownerId },
  }
}

function routeSpec(route: any): UnitSpec["route"] {
  if (!route || typeof route !== "object") return null
  const point = (pair: unknown): { x: number; y: number } | null => {
    if (!Array.isArray(pair) || pair.length < 2) return null
    const y = Number(pair[0])
    const x = Number(pair[1])
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
  }
  const checkpoints = [point(route.start), ...(Array.isArray(route.checkpoints) ? route.checkpoints.map(point) : []), point(route.end)].filter((cell): cell is { x: number; y: number } => cell !== null)
    .map((cell) => ({ type: "move" as const, x: cell.x, y: cell.y }))
  const end = point(route.end)
  return { checkpoints, ...(end ? { end } : {}) }
}

function enemySpec(spawn: any, index: number, at: number, data: any, poolHp: number | null): UnitSpec | null {
  const key = typeof spawn?.enemyKey === "string" ? spawn.enemyKey : ""
  const enemy = key ? data?.enemies?.[key] : null
  if (!enemy) return null
  const boss = spawn.tag === "boss"
  const start = Array.isArray(spawn.route?.start) ? spawn.route.start : null
  const col = start ? Number(start[1]) : 10
  const row = start ? Number(start[0]) : 9
  const scale = boss ? 1 : Number(spawn.mods?.hpMul) > 0 ? Number(spawn.mods.hpMul) : 1
  const hp = boss && poolHp !== null ? poolHp : undefined
  const stats = { ...(enemy.stats ?? {}), ...(hp !== undefined ? { maxHp: hp } : {}) }
  const owner = typeof spawn.ownerPlayerId === "string" ? spawn.ownerPlayerId : ""
  const lpr = Number(enemy.lifePointReduce ?? enemy.lpr)
  return {
    id: `${key}#${index}@${at}`,
    side: "enemy",
    kind: "enemy",
    attributes: attributesOf(stats, hp === undefined ? scale : 1),
    skills: [],
    attackRange: rangeOf(enemy.rangeGrid),
    tags: ["enemy", ...(boss ? ["boss"] : [])],
    deployPositions: ["ground"],
    x: Number.isFinite(col) ? col : 10,
    y: Number.isFinite(row) ? row : 9,
    motion: enemy.stats?.motion === "FLY" ? "FLY" : "WALK",
    route: routeSpec(spawn.route) ?? null,
    script: {
      kind: "enemy",
      chessId: key,
      ownerId: owner,
      boss,
      counted: spawn.countInTotal !== false,
      ...(Number.isFinite(lpr) && lpr >= 0 ? { lpr } : {}),
    },
  }
}

function missionSpec(opts: any): BattleSpec & { modules: string[] } | null {
  const rect = opts?.rect
  if (!rect || !Number.isInteger(rect.r0) || !Number.isInteger(rect.r1) || !Number.isInteger(rect.c0) || !Number.isInteger(rect.c1)) return null
  const exits = new Set<string>()
  for (const route of Array.isArray(opts?.routes) ? opts.routes : []) {
    const end = route?.end
    if (Array.isArray(end) && end.length >= 2) exits.add(`${Number(end[1])},${Number(end[0])}`)
  }
  const tiles: BattleSpec["tiles"][number][] = []
  for (let y = rect.r0; y <= rect.r1; y += 1) {
    for (let x = rect.c0; x <= rect.c1; x += 1) {
      tiles.push({ x, y, height: 0, deployable: true, walkableBy: ["ground", "fly"], ...(exits.has(`${x},${y}`) ? { objective: true } : {}) })
    }
  }
  const data = opts?.data
  const units: UnitSpec[] = []
  for (const player of Array.isArray(opts?.players) ? opts.players : []) {
    const owner = typeof player?.playerId === "string" ? player.playerId : ""
    for (const unit of Array.isArray(player?.units) ? player.units : []) {
      const spec = allySpec(unit, owner, data)
      if (spec) units.push(spec)
    }
  }
  const routes = Array.isArray(opts?.routes) ? opts.routes : []
  const poolHp = opts?.sharedBoss ? Number(opts.sharedBoss.maxHp) : null
  const spawns: SpawnSpec[] = []
  let counted = 0
  let index = 0
  for (const spawn of Array.isArray(opts?.spawns) ? opts.spawns : []) {
    const count = Math.max(1, Number(spawn?.count) || 1)
    const interval = Math.max(0, Number(spawn?.interval) || 0)
    const time = Math.max(0, Number(spawn?.time) || 0)
    const route = routes[Number(spawn?.routeIndex)] ?? null
    for (let copy = 0; copy < count; copy += 1) {
      const at = Math.round((time + copy * interval) / TICK)
      const unit = enemySpec({ ...spawn, route }, index, at, data, poolHp)
      index += 1
      if (!unit) continue
      if (unit.script?.counted !== false) counted += 1
      spawns.push({ atTick: at, unit })
    }
  }
  opts._countedEnemies = counted
  const flags = opts.flags && typeof opts.flags === "object" ? opts.flags : {}
  return {
    seed: (Number(opts.seed) >>> 0) || 1,
    modules: [],
    tiles,
    units,
    spawns,
    deployStrategy: null,
    cost: {
      ally: { initial: Number(flags.dpInit) || 10, regen: Number(flags.dpPerSec) || 1, cap: Number(flags.dpMax) || 99 },
      enemy: { initial: 0, regen: 0, cap: 0 },
    },
  }
}
