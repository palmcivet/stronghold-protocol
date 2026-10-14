import type { ComponentType } from 'react';
import { setLanguage } from '#infra/text/index.js';
import { applySafeArea, applyTextSize } from '#infra/theme/install.js';
import { audioItem, displayItem, identityItem, keysItem } from './items.js';
import { defineSettingSection, getSetting, setSetting } from './section.js';
import {
  type AudioChannel,
  type AudioSettings,
  type ChannelSetting,
  type DisplaySettings,
  type GroundQuality,
  groundQualityOf,
  type IdentitySettings,
  type KeysSettings,
} from './types.js';

export const SECTION = {
  identity: 'core:identity',
  display: 'core:display',
  audio: 'core:audio',
  keys: 'core:keys',
} as const;

type QualitySink = (quality: GroundQuality) => void;
const qualitySinks = new Set<QualitySink>();

/** Field / stage registers to receive mapped ground quality from `core:display`. */
export function onGroundQuality(sink: QualitySink): () => void {
  qualitySinks.add(sink);
  try {
    sink(groundQualityOf(getSetting<DisplaySettings>(SECTION.display).quality));
  } catch {
    // section not registered yet
  }
  return () => {
    qualitySinks.delete(sink);
  };
}

function applyIdentity(
  value: IdentitySettings,
  previous: IdentitySettings | undefined,
): void {
  if (!previous || value.language !== previous.language) {
    setLanguage(value.language);
  }
}

function applyDisplay(
  value: DisplaySettings,
  previous: DisplaySettings | undefined,
): void {
  if (!previous || value.textSize !== previous.textSize) {
    applyTextSize(value.textSize);
  }
  if (!previous || value.safeAreaUi !== previous.safeAreaUi) {
    applySafeArea(value.safeAreaUi ? 'on' : 'off');
  }
  if (!previous || value.quality !== previous.quality) {
    const mapped = groundQualityOf(value.quality);
    for (const sink of qualitySinks) {
      sink(mapped);
    }
  }
}

export interface OfficialPanels {
  readonly identity: ComponentType;
  readonly display: ComponentType;
  readonly audio: ComponentType;
  readonly keys: ComponentType;
}

/**
 * Registers the four official settings sections (wires defineItem storage + profile tabs + apply).
 * Panels stay in the profile domain; items are defined at module load in `items.ts`.
 */
export function registerOfficialSettings(
  panels: OfficialPanels,
): readonly (() => void)[] {
  return [
    defineSettingSection<IdentitySettings>({
      id: SECTION.identity,
      titleKey: 'core:profile.tab.identity',
      order: 10,
      item: identityItem,
      Panel: panels.identity,
      pick: (state) => ({
        language: state.language,
        name: state.name,
        avatar: state.avatar,
      }),
      merge: (value) => value,
      apply: applyIdentity,
    }),
    defineSettingSection<KeysSettings>({
      id: SECTION.keys,
      titleKey: 'core:profile.tab.keys',
      order: 30,
      item: keysItem,
      Panel: panels.keys,
      pick: (state) => ({ keymap: state.keymap }),
      merge: (value) => value,
    }),
    defineSettingSection<DisplaySettings>({
      id: SECTION.display,
      titleKey: 'core:profile.tab.display',
      order: 40,
      item: displayItem,
      Panel: panels.display,
      pick: (state) => ({
        quality: state.quality,
        textSize: state.textSize,
        safeAreaUi: state.safeAreaUi,
      }),
      merge: (value) => value,
      apply: applyDisplay,
    }),
    defineSettingSection<AudioSettings>({
      id: SECTION.audio,
      titleKey: 'core:profile.tab.audio',
      order: 50,
      item: audioItem,
      Panel: panels.audio,
      pick: (state) => ({ audio: state.audio }),
      merge: (value) => value,
    }),
  ];
}

/** Changes one volume channel and keeps the others. */
export function setChannel(
  channel: AudioChannel,
  change: Partial<ChannelSetting>,
): void {
  const { audio } = getSetting<AudioSettings>(SECTION.audio);
  setSetting<AudioSettings>(SECTION.audio, {
    audio: { ...audio, [channel]: { ...audio[channel], ...change } },
  });
}
