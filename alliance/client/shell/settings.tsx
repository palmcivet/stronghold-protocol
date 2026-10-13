import { useSettings } from '../infra/store/hook.js';
import {
  AUDIO_CHANNELS,
  setChannel,
  settingsStore,
} from '../infra/store/settings.js';
import { LANGUAGES, type Language, useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import { ChoiceGroup, Panel, Slider, ToggleButton } from '../ui/index.js';
import styles from './shell.module.css';

const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  'zh-Hans': '简体中文',
  en: 'English',
};

export function Settings() {
  const t = useText();
  const language = useSettings((state) => state.language);
  return (
    <div className={cx(styles.settings)}>
      <ChoiceGroup
        label={t('core:settings.language')}
        value={language}
        onChange={(value) =>
          settingsStore.setState({ language: value as Language })
        }
        options={LANGUAGES.map((value) => ({
          value,
          label: LANGUAGE_NAMES[value],
        }))}
      />
    </div>
  );
}

/** Volume and mute of the master, music and sound effect channels. */
export function AudioSettings() {
  const t = useText();
  const audio = useSettings((state) => state.audio);
  return (
    <Panel title={t('core:profile.audio')}>
      <ul className={cx(styles.channels)}>
        {AUDIO_CHANNELS.map((channel) => {
          const label = t(`core:profile.audio.${channel}`);
          return (
            <li key={channel} className={cx(styles.channel)}>
              <Slider
                label={label}
                value={audio[channel].volume}
                isDisabled={audio[channel].muted}
                onChange={(volume) => setChannel(channel, { volume })}
              />
              <ToggleButton
                aria-label={`${label} ${t('core:profile.audio.mute')}`}
                isSelected={audio[channel].muted}
                onChange={(muted) => setChannel(channel, { muted })}
              >
                {t('core:profile.audio.mute')}
              </ToggleButton>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
