import { CanvasTexture, Sprite, SpriteMaterial, Texture } from 'three';
import type { MissionCue, MissionEffectKindId } from '#contract/cue.js';
import type { MissionEffectKind } from '#effect/table.js';

/** How a damage number is coloured: by damage kind, or the official red integer and yellow MISS. */
export type MissionNumberStyle =
  | 'physical'
  | 'arts'
  | 'true'
  | 'heal'
  | 'element'
  | 'red'
  | 'miss';

/** Top and bottom fill and the outline of each style, as master draws them. */
export const MISSION_NUMBER_COLORS: Readonly<
  Record<
    MissionNumberStyle,
    { readonly fill: readonly [string, string]; readonly stroke: string }
  >
> = Object.freeze({
  physical: { fill: ['#fffbe8', '#ffb35c'], stroke: '#3b1400' },
  arts: { fill: ['#fbe8ff', '#c77dff'], stroke: '#2a0b45' },
  true: { fill: ['#ffffff', '#e8e8e8'], stroke: '#2a2a2a' },
  heal: { fill: ['#eafff0', '#62f08a'], stroke: '#07361a' },
  element: { fill: ['#fff4e0', '#ff7b3a'], stroke: '#3a1000' },
  red: { fill: ['#ffd0d0', '#ff2a2a'], stroke: '#4a0000' },
  miss: { fill: ['#ffe0a8', '#ff9000'], stroke: '#4a2400' },
});

/**
 * Damage number motion, as master: it rises `rise` tiles over `riseSeconds` easing out, lives `seconds` and fades over
 * the last `fadeSeconds`. A hit of at least `big` of the maximum health is drawn `bigScale` times larger. `height` is
 * a line of text in tiles and `lift` the start above the unit's position.
 */
export const MISSION_NUMBER_MOTION = Object.freeze({
  rise: 0.45,
  riseSeconds: 0.9,
  seconds: 0.9,
  fadeSeconds: 0.27,
  big: 0.18,
  bigScale: 1.35,
  height: 0.21,
  digitWidth: 0.66,
  lift: 1.05,
});

export interface MissionDamageNumberOptions {
  readonly id?: MissionEffectKindId;
  /** Official numbers: only the red integers and MISS show. Otherwise every hit and heal shows, coloured by kind. */
  readonly official?: boolean;
  /** Texture of a number's text in a style. Defaults to a canvas drawing, or a blank texture where there is no DOM. */
  readonly texture?: (text: string, style: MissionNumberStyle) => Texture;
}

/** A number as drawn: its text and style. */
export interface MissionDamageNumber {
  readonly sprite: Sprite;
  text: string;
  style: MissionNumberStyle;
  age: number;
  scale: number;
  baseY: number;
}

/** Text and outline drawn on a canvas, or a blank texture where there is no DOM. */
export function defaultNumberTexture(
  text: string,
  style: MissionNumberStyle,
): Texture {
  if (typeof document === 'undefined') {
    return new Texture();
  }
  const colors = MISSION_NUMBER_COLORS[style];
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(32, text.length * 24);
  canvas.height = 40;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createLinearGradient(0, 4, 0, 36);
    gradient.addColorStop(0, colors.fill[0]);
    gradient.addColorStop(1, colors.fill[1]);
    context.font = 'bold 32px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 5;
    context.strokeStyle = colors.stroke;
    context.strokeText(text, canvas.width / 2, 21);
    context.fillStyle = gradient;
    context.fillText(text, canvas.width / 2, 21);
  }
  return new CanvasTexture(canvas);
}

function styleOfKind(kind: string): MissionNumberStyle {
  if (kind === 'physical' || kind === 'arts' || kind === 'true') {
    return kind;
  }
  return kind === 'heal' ? 'heal' : 'element';
}

type NumberCue = MissionCue<'damaged' | 'heal' | 'dodged'>;

/** What a cue shows: the unit, the text and the style, or null when it shows nothing in this mode. */
export function damageNumberOf(
  cue: NumberCue,
  official: boolean,
): {
  unitId: string;
  text: string;
  style: MissionNumberStyle;
  amount: number;
} | null {
  if (cue.key === 'dodged') {
    return cue.data.miss === true
      ? { unitId: cue.data.targetId, text: 'MISS', style: 'miss', amount: 0 }
      : null;
  }
  if (cue.key === 'heal') {
    const amount = Math.round(cue.data.amount);
    return official || !(amount > 0)
      ? null
      : { unitId: cue.data.unitId, text: `+${amount}`, style: 'heal', amount };
  }
  const amount = Math.round(cue.data.applied);
  if (official) {
    return cue.data.red === true
      ? {
          unitId: cue.data.targetId,
          text: String(amount),
          style: 'red',
          amount,
        }
      : null;
  }
  return amount > 0
    ? {
        unitId: cue.data.targetId,
        text: String(amount),
        style: styleOfKind(cue.data.kind),
        amount,
      }
    : null;
}

/** An effect kind drawing damage, heal and MISS numbers over the unit, facing the camera. */
export function createDamageNumberKind(
  options: MissionDamageNumberOptions = {},
): MissionEffectKind<'damaged' | 'heal' | 'dodged', MissionDamageNumber> {
  const motion = MISSION_NUMBER_MOTION;
  const texture = options.texture ?? defaultNumberTexture;
  const official = options.official === true;
  const place = (number: MissionDamageNumber): void => {
    const t = Math.min(1, number.age / motion.riseSeconds);
    const eased = 1 - (1 - t) * (1 - t);
    number.sprite.position.y = number.baseY + motion.rise * eased;
    const left = motion.seconds - number.age;
    number.sprite.material.opacity = Math.max(
      0,
      Math.min(1, left / motion.fadeSeconds),
    );
  };
  return {
    id: options.id ?? 'mission:damage-number',
    accepts: ['damaged', 'heal', 'dodged'],
    create() {
      const sprite = new Sprite(
        new SpriteMaterial({ transparent: true, depthTest: false }),
      );
      sprite.renderOrder = 12;
      sprite.visible = false;
      return {
        sprite,
        text: '',
        style: 'physical',
        age: 0,
        scale: 1,
        baseY: 0,
      };
    },
    start(number, cue, context) {
      const shown = damageNumberOf(cue, official);
      const actor = shown ? context.actors.get(shown.unitId) : undefined;
      if (!shown || !actor) {
        return false;
      }
      const max = actor.unit.maxHp;
      number.text = shown.text;
      number.style = shown.style;
      number.age = 0;
      number.scale =
        max > 0 && shown.amount >= max * motion.big ? motion.bigScale : 1;
      number.sprite.material.map?.dispose();
      number.sprite.material.map = texture(shown.text, shown.style);
      number.sprite.material.needsUpdate = true;
      const height = motion.height * number.scale;
      number.sprite.scale.set(
        height * motion.digitWidth * shown.text.length,
        height,
        1,
      );
      number.baseY = actor.position.height + motion.lift;
      number.sprite.position.set(
        actor.position.x,
        number.baseY,
        -actor.position.y,
      );
      number.sprite.visible = true;
      place(number);
      context.layer.add(number.sprite);
      return true;
    },
    update(number, deltaSeconds) {
      number.age += deltaSeconds;
      place(number);
      return number.age < motion.seconds;
    },
    end(number, context) {
      number.sprite.visible = false;
      context.layer.remove(number.sprite);
    },
    dispose(number) {
      number.sprite.material.map?.dispose();
      number.sprite.material.dispose();
    },
  };
}
