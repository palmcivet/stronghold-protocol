import {
  BIND,
  BOSS,
  COLD,
  ELITE,
  FEAR,
  FREEZE,
  INVULNERABLE,
  LEVITATE,
  SILENCE,
  SLEEP,
  STEALTH,
  STUN,
} from 'arknights-mission-core';
import { CanvasTexture, Texture } from 'three';

/** A status icon shown over the bar while the unit carries the tag. */
export interface MissionHudIcon {
  readonly tag: string;
  /** Icon key handed to `iconTexture`. */
  readonly icon: string;
  /** Colour of the square drawn when there is no texture for the icon. */
  readonly color: number;
}

/** A frame around the bar of a unit carrying the tag; the first listed tag a unit carries wins. */
export interface MissionHudFrame {
  readonly tag: string;
  readonly color: number;
  /** Bar width multiplier. */
  readonly width: number;
  /** Seconds the bar shakes after the unit loses health. Without it the bar holds still. */
  readonly shake?: number;
}

/** The engine's status icons, in drawing order. */
export const MISSION_HUD_ICONS: readonly MissionHudIcon[] = Object.freeze([
  { tag: FREEZE.id, icon: 'freeze', color: 0x8fd8ff },
  { tag: STUN.id, icon: 'stun', color: 0xffd34d },
  { tag: SLEEP.id, icon: 'sleep', color: 0x9b8cff },
  { tag: INVULNERABLE.id, icon: 'invulnerable', color: 0xfff2a8 },
  { tag: STEALTH.id, icon: 'stealth', color: 0x8a8f99 },
  { tag: SILENCE.id, icon: 'silence', color: 0xc0c0c0 },
  { tag: COLD.id, icon: 'cold', color: 0xbfe9ff },
  { tag: BIND.id, icon: 'bind', color: 0xa0705a },
  { tag: FEAR.id, icon: 'fear', color: 0x6a4c93 },
  { tag: LEVITATE.id, icon: 'levitate', color: 0x9ee6c8 },
]);

/** The official rank frames: boss before elite. */
export const MISSION_HUD_FRAMES: readonly MissionHudFrame[] = Object.freeze([
  { tag: BOSS.id, color: 0xff2d55, width: 2, shake: 0.25 },
  { tag: ELITE.id, color: 0xff7a33, width: 1 },
]);

export interface MissionHudStyle {
  /** Status icons. Defaults to `MISSION_HUD_ICONS`. */
  readonly icons?: readonly MissionHudIcon[];
  /** Rank frames. Defaults to `MISSION_HUD_FRAMES`. */
  readonly frames?: readonly MissionHudFrame[];
  /** Texture of an icon key; null draws the icon's colour square. */
  readonly iconTexture?: (icon: string) => Texture | null;
  /** Texture of one digit of the redeploy countdown. Called once per digit; every ring shares the result. */
  readonly digitTexture?: (digit: number) => Texture;
}

/** A white digit on a transparent canvas, or a blank texture where there is no DOM. */
export function defaultDigitTexture(digit: number): Texture {
  if (typeof document === 'undefined') {
    return new Texture();
  }
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 48;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#ffffff';
    context.font = 'bold 40px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(digit), 16, 26);
  }
  return new CanvasTexture(canvas);
}
