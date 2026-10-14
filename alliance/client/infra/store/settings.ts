/**
 * Personal configuration view. Prefer `#infra/settings` (`getSetting` / `setSetting` / `useSetting`).
 * This module re-exports the aggregate store and helpers for existing call sites.
 */
export {
  AUDIO_CHANNELS,
  type AudioChannel,
  audioGains,
  type ChannelSetting,
  DEFAULT_AUDIO,
  groundQualityOf,
  QUALITIES,
  type Quality,
  type SettingsState,
  setChannel,
  settingsStore,
  TEXT_SIZES,
  type TextSize,
} from '#infra/settings/index.js';
