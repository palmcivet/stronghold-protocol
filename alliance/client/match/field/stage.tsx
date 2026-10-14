import { GEO, PHASE } from '@alliance/contract/match.js';
import type { AssetKey } from 'arknights-assets-catalog';
import type { BattleSnapshot, TileCoord } from 'arknights-mission-core';
import {
  createMissionCueBindings,
  createMissionEffectTable,
  createMissionStage,
  installOfficialFx,
  type MissionBoard,
  type MissionMap,
} from 'arknights-mission-renderer';
import {
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useStore } from 'zustand';
import { useIntent } from '#infra/intent/context.js';
import { assetsStore } from '#infra/store/assets.js';
import { useMatch, useMatchCatalog, useStream } from '#infra/store/hook.js';
import { stageMapStore } from '#infra/store/stage-map.js';
import { cx } from '#infra/theme/class-name.js';
import { equipItem } from '#match/equip.js';
import { createActorModels, modelScaleOf } from '#match/field/actors.js';
import { useBoardActions } from '#match/field/board-actions.js';
import { installCombatFx } from '#match/field/combat-fx.js';
import {
  createGroundArtPort,
  groundArtPackOf,
  hasOfficialDiffuse,
} from '#match/field/ground-art.js';
import { enemyKeyOfPenUnit, PEN_RECT, penUnitsOf } from '#match/field/pen.js';
import {
  createPrepDrag,
  type PrepDragPiece,
  type PrepDropTarget,
  pieceSlot,
} from '#match/field/prep-drag.js';
import { PrepItemMarks } from '#match/field/prep-marks.js';
import {
  assetDefIdOf,
  battleEventOf,
  benchSlotAt,
  cameraFor,
  clipMissionMapForPhase,
  groundAreasForPhase,
  type HudInsets,
  missionMapOf,
  NO_INSETS,
  onBoard,
  PREP_RECT,
  pieceUidOf,
  pieceUnitId,
  prepSnapshotOf,
  streamSnapshotFor,
} from '#match/field/scene.js';
import { setFieldHitApi } from '#match/field-hit.js';
import { penStore, setPen } from '#match/pen-state.js';
import type { Playback } from '#match/playback.js';
import { findPiece, pieceAt, selectionStore } from '#match/selection.js';
import styles from './field.module.css';

const NO_LOCAL = () => null;
const NO_SUBSCRIBE = () => () => {};

/**
 * CSS px of HUD along the top and bottom edges that the framed rows keep clear of. Side chrome (team / effects)
 * floats over the map — left/right stay 0 so the ground fills under them as master's does.
 */
function hudInsets(host: HTMLElement): HudInsets {
  const layout = host.closest('[data-layout="match"]');
  if (!layout) {
    return NO_INSETS;
  }
  const box = host.getBoundingClientRect();
  const region = (name: string): DOMRect | null => {
    const element = layout.querySelector(`[data-region="${name}"]`);
    const rect = element?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  };
  const top = region('top');
  const bottom = region('bottom');
  return {
    top: top ? Math.max(0, top.bottom - box.top) : 0,
    bottom: bottom ? Math.max(0, box.bottom - bottom.top) : 0,
    left: 0,
    right: 0,
  };
}

/**
 * The battlefield: the renderer's 3D stage filling the match screen under the HUD, as master's field view. It draws the
 * stage's ground with the own board and bench during the preparation, and the battle master streams during combat (or
 * the battle this client runs). A press on it picks or moves pieces like the keyboard grid.
 */
export function StageField({
  playback,
  preparing,
  canAct,
}: {
  readonly playback: Playback | null;
  readonly preparing: boolean;
  readonly canAct: boolean;
}) {
  const local = useSyncExternalStore(
    playback?.subscribe ?? NO_SUBSCRIBE,
    playback?.local ?? NO_LOCAL,
    NO_LOCAL,
  );
  const { stageId, own, phase } = useMatch((state) => ({
    stageId: state.public?.stageId ?? null,
    own: state.private,
    phase: state.public?.phase ?? null,
  }));
  const stream = useStream((state) => ({
    fieldId: state.fieldId,
    snapshot: state.snapshot,
    info: state.info,
    rect: state.rect,
    events: state.events,
  }));
  const stageMap = useStore(stageMapStore, (state) =>
    stageId ? (state.maps[stageId] ?? null) : null,
  );
  const selected = useStore(selectionStore, (state) => state.uid);
  const actions = useBoardActions(canAct);
  const catalog = useMatchCatalog();
  const resources = useStore(assetsStore, (state) => state.resources);
  const models = useMemo(
    () => (resources ? createActorModels(resources) : null),
    [resources],
  );

  const pen = useStore(penStore, (state) => state.pen);
  const map: MissionMap | null = useMemo(() => {
    // Own half in prep/normal combat (pen mesh only with the pen camera); both halves only in 联防.
    const raw = local?.map ?? (stageMap ? missionMapOf(stageMap) : null);
    return raw ? clipMissionMapForPhase(raw, phase, { pen }) : null;
  }, [local, stageMap, phase, pen]);
  // never fall back to the prep board in combat; an empty stream still uses the combat rect
  const showsPrep = preparing;
  const rect = showsPrep
    ? pen
      ? PEN_RECT
      : PREP_RECT
    : (stream.rect ??
      (phase === PHASE.UNITE
        ? GEO.UNITE_RECT
        : phase === PHASE.FINAL_ASSAULT || phase === PHASE.HIDDEN_CORE
          ? GEO.BOSS_RECT
          : GEO.NORMAL_RECT));
  const snapshot: BattleSnapshot | null = useMemo(() => {
    // Local sim drives the stage every frame; still expose its units so appearances can bind.
    if (local) {
      return local.battle.snapshot();
    }
    if (!showsPrep) {
      const streamed = streamSnapshotFor(stream.snapshot, stream.info);
      // Docs: neither local nor stream → keep the prep board visible (not an empty void).
      if (streamed.units.length > 0 || stream.snapshot) {
        return streamed;
      }
      return prepSnapshotOf(own);
    }
    const prep = prepSnapshotOf(own);
    const wave = own?.nextEnemies ?? [];
    if (!pen || !wave.length) {
      return prep;
    }
    return {
      ...prep,
      units: [...prep.units, ...penUnitsOf(wave)],
    };
  }, [local, showsPrep, pen, own, stream.snapshot, stream.info]);
  /** The model of each unit on the stage: the operator's of a piece, the enemy's or operator's of a streamed unit. */
  const modelKeys: Readonly<Record<string, AssetKey>> = useMemo(() => {
    const charKey = (id: string | null | undefined): AssetKey | null => {
      const charId = id?.startsWith('char_')
        ? id
        : id
          ? (catalog.chess[id]?.charId ?? null)
          : null;
      return charId ? `spine:char/${charId}/front` : null;
    };
    const keys: Record<string, AssetKey> = {};
    const pieces = new Map(
      [...(own?.board ?? []), ...(own?.hand ?? []), ...(own?.temp ?? [])]
        .filter((piece) => piece !== null)
        .map((piece) => [pieceUnitId(piece.uid), piece.id] as const),
    );
    for (const unit of snapshot?.units ?? []) {
      const defId = assetDefIdOf(unit.id, pieces, stream.info[unit.id]?.defId);
      if (!defId) {
        continue;
      }
      const enemy =
        defId.startsWith('enemy_') || unit.kind === 'enemy' || Boolean(enemyKeyOfPenUnit(unit.id));
      const key = enemy
        ? (`spine:enemy/${defId}` as const)
        : charKey(defId);
      if (key) {
        keys[unit.id] = key;
      }
    }
    return keys;
  }, [snapshot, own, stream.info, catalog]);
  const highlights: readonly TileCoord[] = useMemo(() => {
    const held = findPiece(own, selected);
    if (held?.area === 'board' && held.piece.col !== undefined) {
      return [{ x: held.piece.col, y: held.piece.row ?? 0 }];
    }
    if (held && held.area !== 'board') {
      const slots = held.area === 'hand' ? own?.hand : own?.temp;
      const idx = slots?.indexOf(held.piece) ?? -1;
      return idx < 0
        ? []
        : [
            held.area === 'hand'
              ? { x: idx, y: GEO.HAND_ROW }
              : { x: GEO.TEMP_C0 + idx, y: GEO.TEMP_ROW },
          ];
    }
    return [];
  }, [own, selected]);

  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<MissionBoard | null>(null);
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!showsPrep && penStore.getState().pen) {
      setPen(false);
    }
  }, [showsPrep]);

  const live = useRef({
    rect,
    local,
    playback,
    map,
    snapshot,
    phase,
    models,
    modelKeys,
    catalog,
    own,
    streamInfo: stream.info,
  });
  live.current = {
    rect,
    local,
    playback,
    map,
    snapshot,
    phase,
    models,
    modelKeys,
    catalog,
    own,
    streamInfo: stream.info,
  };
  const shown = useRef(new Map<string, AssetKey>());
  const resourcesLive = useRef(resources);
  resourcesLive.current = resources;

  const frame = useCallback((): void => {
    const element = host.current;
    const board = stage.current;
    if (!element || !board) {
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    setHostSize({ width, height });
    board.resize(width, height);
    board.dispatch({
      type: 'set-camera',
      camera: cameraFor(
        live.current.rect,
        { width, height },
        hudInsets(element),
      ),
    });
  }, []);

  // Pack key: rebuild only when diffuse source flips (stand-in ↔ official). Actor models hot-update via configureActors.
  const groundPackKey = hasOfficialDiffuse(resources) ? 'official' : 'stand-in';

  useEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }
    let board: MissionBoard | null = null;
    let canvas: HTMLElement | null = null;
    // the ground's canvas appears once a map is drawn; it goes into the field layer then
    const place = (): void => {
      const next = (board?.canvas ?? null) as unknown as HTMLElement | null;
      if (next && next !== canvas) {
        canvas?.remove();
        canvas = next;
        next.style.pointerEvents = 'none';
        element.append(next);
        frame();
      }
    };
    try {
      // master draws its field on any GPU, a software one included: no simplified board here either
      const effects = createMissionEffectTable();
      const cues = createMissionCueBindings();
      installOfficialFx(effects, cues);
      installCombatFx(effects, cues);
      // Live resources bridge: pack key is fixed for this effect run; image/model/json resolve through the latest store.
      const packResources = resourcesLive.current;
      const groundResources = {
        resolver: {
          has(key: AssetKey): boolean {
            return resourcesLive.current?.resolver.has(key) === true;
          },
        },
        image: (key: AssetKey) => {
          const store = resourcesLive.current;
          if (!store) {
            return Promise.reject(new Error(`no ground art ${key}`));
          }
          return store.image(key);
        },
      };
      board = createMissionStage(null, {
        ...(live.current.models ? { actors: live.current.models.options } : {}),
        effects,
        cues,
        terrain: {
          allowSlowGpu: true,
          resources: createGroundArtPort(groundResources),
          pack: groundArtPackOf(packResources),
          // Own-half field (no pen) unless the pen camera is on; 联防 widens.
          areas: groundAreasForPhase(live.current.phase, {
            pen: penStore.getState().pen,
          }),
          onMode: () => place(),
        },
      });
    } catch (failure) {
      console.warn('[field] the stage cannot start', failure);
      return;
    }
    stage.current = board;
    shown.current = new Map();
    const running: MissionBoard = board;
    // Replay map / snapshot after (re)build; appearances rebind in the rAF path; seenEvent watermark is kept across rebuilds.
    if (live.current.map) {
      running.dispatch({ type: 'set-map', map: live.current.map });
    }
    if (live.current.snapshot) {
      running.dispatch({
        type: 'push-snapshot',
        snapshot: live.current.snapshot,
      });
    }
    const observer = new ResizeObserver(() => frame());
    observer.observe(element);
    const layout = element.closest('[data-layout="match"]');
    for (const region of layout?.querySelectorAll('[data-region]') ?? []) {
      observer.observe(region);
    }
    let raf = 0;
    let last = performance.now();
    /** Single appearance-binding path (prep + combat + local sim). */
    const bindAppearance = (
      unitId: string,
      key: AssetKey,
      board: MissionBoard,
    ): void => {
      const { models: actorModels, catalog: cat, streamInfo } = live.current;
      if (!actorModels || shown.current.get(unitId) === key || !actorModels.has(key)) {
        return;
      }
      shown.current.set(unitId, key);
      const info = streamInfo[unitId];
      const enemy =
        info?.kind === 'enemy' && info.defId
          ? cat.enemies[info.defId]
          : key.startsWith('spine:enemy/')
            ? cat.enemies[key.slice('spine:enemy/'.length)]
            : undefined;
      const sized = enemy
        ? modelScaleOf(enemy.modelScale, enemy.modelScaleY)
        : null;
      void actorModels.appearance(key).then((appearance) => {
        if (appearance && stage.current === board) {
          board.dispatch({
            type: 'set-appearances',
            appearances: {
              [unitId]: sized
                ? {
                    ...appearance,
                    scale: sized.scale,
                    scaleY: sized.scaleY,
                  }
                : appearance,
            },
          });
        }
      });
    };

    const bindAll = (board: MissionBoard): void => {
      for (const [unitId, key] of Object.entries(live.current.modelKeys)) {
        bindAppearance(unitId, key, board);
      }
    };

    const tick = (at: number): void => {
      const seconds = Math.min(0.25, (at - last) / 1000);
      last = at;
      const {
        local: battle,
        playback: runner,
        own: privateView,
        streamInfo,
        catalog: cat,
      } = live.current;
      if (battle && runner) {
        runner.advance(seconds);
        const snap = battle.battle.snapshot();
        running.dispatch({
          type: 'push-snapshot',
          snapshot: snap,
        });
        // Local sim units change every frame; derive keys from the live snap (modelKeys memo lags).
        const pieces = new Map(
          [
            ...(privateView?.board ?? []),
            ...(privateView?.hand ?? []),
            ...(privateView?.temp ?? []),
          ]
            .filter((piece) => piece !== null)
            .map((piece) => [pieceUnitId(piece.uid), piece.id] as const),
        );
        for (const unit of snap.units) {
          const defId = assetDefIdOf(
            unit.id,
            pieces,
            streamInfo[unit.id]?.defId,
          );
          if (!defId) {
            continue;
          }
          const enemy =
            defId.startsWith('enemy_') ||
            unit.kind === 'enemy' ||
            Boolean(enemyKeyOfPenUnit(unit.id));
          const key: AssetKey | null = enemy
            ? (`spine:enemy/${defId}` as const)
            : (() => {
                const charId = defId.startsWith('char_')
                  ? defId
                  : (cat.chess[defId]?.charId ?? null);
                return charId
                  ? (`spine:char/${charId}/front` as const)
                  : null;
              })();
          if (key) {
            bindAppearance(unit.id, key, running);
          }
        }
      } else {
        bindAll(running);
      }
      running.update(seconds);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      running.destroy();
      canvas?.remove();
      stage.current = null;
    };
    // Rebuild only when the ground pack source flips; models hot-update below.
  }, [frame, groundPackKey]);

  // Late-arriving Spine models: hot-update the actor backend instead of destroying the stage.
  useEffect(() => {
    const board = stage.current;
    if (!board || !models) {
      return;
    }
    board.configureActors(models.options);
    shown.current = new Map();
  }, [models]);


  useEffect(() => {
    if (map) {
      stage.current?.dispatch({ type: 'set-map', map });
      frame();
    }
  }, [map, frame]);

  useEffect(() => {
    // Master boardArea: own half in prep/combat; both halves only in 联防; pen mesh only for the pen camera.
    stage.current?.terrain?.setAreas(groundAreasForPhase(phase, { pen }));
    frame();
  }, [phase, pen, frame]);


  // biome-ignore lint/correctness/useExhaustiveDependencies: the rect is read through `live`; its edges trigger a reframe
  useEffect(() => {
    frame();
  }, [frame, rect.r0, rect.r1, rect.c0, rect.c1]);

  useEffect(() => {
    stage.current?.dispatch({
      type: 'set-update-mode',
      mode: local ? 'local' : 'external',
    });
  }, [local]);

  useEffect(() => {
    // Local battles are advanced + snapped in the rAF tick; do not double-push here.
    if (snapshot && !local) {
      stage.current?.dispatch({ type: 'push-snapshot', snapshot });
    }
  }, [snapshot, local]);

  const seenEvent = useRef(0);
  // Reset watermark on field / stream session change (`m.field`, `b.start` → openStreamField).
  useEffect(() => {
    seenEvent.current = 0;
  }, [stream.fieldId]);
  useEffect(() => {
    if (stream.events.length === 0) {
      seenEvent.current = 0;
    }
  }, [stream.events]);
  useEffect(() => {
    const board = stage.current;
    if (!board || showsPrep) {
      return;
    }
    for (const line of stream.events) {
      if (line.seq <= seenEvent.current) {
        continue;
      }
      seenEvent.current = line.seq;
      const event = battleEventOf(line.event);
      if (event) {
        board.dispatch({ type: 'push-event', event });
      }
    }
  }, [stream.events, showsPrep]);

  useEffect(() => {
    stage.current?.dispatch({ type: 'set-highlights', tiles: highlights });
  }, [highlights]);

  const intents = useIntent();
  const drag = useRef<ReturnType<typeof createPrepDrag> | null>(null);
  const liveAct = useRef({ canAct, actions, view: own, intents });
  liveAct.current = { canAct, actions, view: own, intents };

  useEffect(() => {
    const applyDrop = async (
      piece: PrepDragPiece['piece'],
      target: PrepDropTarget,
    ): Promise<void> => {
      const { intents: bus, view: privateView } = liveAct.current;
      if (target.area === 'outside') {
        if (piece.kind === 'item') {
          await bus.dispatch({
            type: 'g.destroy',
            fields: { uid: piece.uid },
          });
        } else {
          await bus.dispatch({
            type: 'g.sell',
            fields: { uid: piece.uid },
          });
        }
        selectionStore.setState({ uid: null });
        return;
      }
      if (target.area === 'hand') {
        await bus.dispatch({
          type: 'g.move',
          fields: { uid: piece.uid, to: { area: 'hand', idx: target.idx } },
        });
        selectionStore.setState({ uid: null });
        return;
      }
      const occupant = privateView
        ? privateView.board.find(
            (each) => each.row === target.row && each.col === target.col,
          )
        : null;
      if (piece.kind === 'item' && occupant && occupant.kind !== 'item') {
        await equipItem(bus, piece.uid, occupant);
      } else {
        await bus.dispatch({
          type: 'g.move',
          fields: {
            uid: piece.uid,
            to: { area: 'board', row: target.row, col: target.col },
          },
        });
      }
      selectionStore.setState({ uid: null });
    };

    const controller = createPrepDrag({
      canPlace: (_piece, row, col, target) => {
        if (target.area === 'hand') {
          return true;
        }
        if (target.area === 'board') {
          return onBoard(col, row);
        }
        return false;
      },
      hitPiece: (x, y) => {
        const board = stage.current;
        const { view: privateView } = liveAct.current;
        if (!board || !privateView) {
          return null;
        }
        const hit = board.pick(x, y);
        // Prefer the unit mesh, but a tile under a piece must still start a drag — pick often
        // returns the tile when the pointer is on the cell but outside UNIT_REACH.
        let located =
          hit.type === 'unit'
            ? findPiece(privateView, pieceUidOf(hit.unitId))
            : null;
        if (!located && hit.type === 'tile') {
          const slot = benchSlotAt(hit.x, hit.y);
          if (slot) {
            const piece =
              (slot.area === 'hand' ? privateView.hand : privateView.temp)[
                slot.idx
              ] ?? null;
            located = piece ? findPiece(privateView, piece.uid) : null;
          } else if (onBoard(hit.x, hit.y)) {
            const piece = pieceAt(privateView, hit.y, hit.x);
            located = piece ? findPiece(privateView, piece.uid) : null;
          }
        }
        if (!located) {
          return null;
        }
        const from = pieceSlot(located);
        return from ? { piece: located.piece, from } : null;
      },
      pickTile: (x, y) => {
        const board = stage.current;
        if (!board) {
          return null;
        }
        const hit = board.pick(x, y);
        if (hit.type === 'tile') {
          return { row: hit.y, col: hit.x };
        }
        if (hit.type === 'unit') {
          const unit = board.view.units.find((each) => each.id === hit.unitId);
          return unit
            ? { row: Math.round(unit.y), col: Math.round(unit.x) }
            : null;
        }
        return null;
      },
      emit: (event) => {
        if (event.type === 'click') {
          const { from } = event;
          if (from.area === 'hand' || from.area === 'temp') {
            void liveAct.current.actions.bench(from.area, from.idx);
          } else {
            void liveAct.current.actions.tile(from.row, from.col);
          }
          return;
        }
        if (event.type === 'drop') {
          void applyDrop(event.piece, event.target);
        }
      },
    });
    drag.current = controller;
    return () => {
      controller.reset();
      drag.current = null;
    };
  }, []);

  useEffect(() => {
    drag.current?.setEditable(canAct && showsPrep);
  }, [canAct, showsPrep]);

  useEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }
    setFieldHitApi({
      contains: (clientX, clientY) => {
        const box = element.getBoundingClientRect();
        return (
          clientX >= box.left &&
          clientX <= box.right &&
          clientY >= box.top &&
          clientY <= box.bottom
        );
      },
      pickTile: (clientX, clientY) => {
        const board = stage.current;
        if (!board || !showsPrep) {
          return null;
        }
        const box = element.getBoundingClientRect();
        const hit = board.pick(clientX - box.left, clientY - box.top);
        if (hit.type === 'tile') {
          return { row: hit.y, col: hit.x };
        }
        if (hit.type === 'unit') {
          const unit = board.view.units.find((each) => each.id === hit.unitId);
          return unit
            ? { row: Math.round(unit.y), col: Math.round(unit.x) }
            : null;
        }
        return null;
      },
    });
    return () => setFieldHitApi(null);
  }, [showsPrep]);

  const localPoint = (
    event: PointerEvent<HTMLDivElement>,
  ): {
    pointerId: number;
    pointerType: string;
    button: number;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } | null => {
    const element = host.current;
    if (!element) {
      return null;
    }
    const box = element.getBoundingClientRect();
    return {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      button: event.button,
      x: event.clientX - box.left,
      y: event.clientY - box.top,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    const board = stage.current;
    const controller = drag.current;
    const point = localPoint(event);
    if (!board || !point || !showsPrep) {
      return;
    }
    // pen view: tap a preview figure → enemy detail (master pieceClick preview)
    if (pen) {
      const hit = board.pick(point.x, point.y);
      if (hit.type === 'unit') {
        const enemyKey = enemyKeyOfPenUnit(hit.unitId);
        if (enemyKey) {
          selectionStore.setState({
            uid: null,
            enemyDetail: { id: enemyKey },
          });
          return;
        }
      }
      return;
    }
    if (controller?.pointerDown(point)) {
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    // empty tile: place the selection or clear it
    const hit = board.pick(point.x, point.y);
    let tile: { readonly x: number; readonly y: number } | null =
      hit.type === 'tile' ? hit : null;
    if (hit.type === 'unit') {
      const unit = board.view.units.find((each) => each.id === hit.unitId);
      tile = unit ? { x: Math.round(unit.x), y: Math.round(unit.y) } : null;
    }
    if (!tile) {
      selectionStore.setState({ uid: null });
      return;
    }
    const slot = benchSlotAt(tile.x, tile.y);
    if (slot) {
      void actions.bench(slot.area, slot.idx);
    } else if (onBoard(tile.x, tile.y)) {
      void actions.tile(tile.y, tile.x);
    } else {
      selectionStore.setState({ uid: null });
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const point = localPoint(event);
    if (point) {
      drag.current?.pointerMove(point);
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const point = localPoint(event);
    if (point) {
      drag.current?.pointerUp(point);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onPointerCancel = (event: PointerEvent<HTMLDivElement>): void => {
    const point = localPoint(event);
    drag.current?.pointerCancel(point ?? undefined);
  };

  const prepCamera =
    showsPrep && hostSize.width > 0
      ? cameraFor(
          rect,
          hostSize,
          host.current ? hudInsets(host.current) : NO_INSETS,
        )
      : null;

  return (
    <div
      ref={host}
      className={cx(styles.stage)}
      data-stage={map ? 'ready' : 'loading'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {showsPrep && prepCamera ? (
        <PrepItemMarks
          view={own}
          map={map}
          camera={prepCamera}
          width={hostSize.width}
          height={hostSize.height}
        />
      ) : null}
    </div>
  );
}
