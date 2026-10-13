import { NAME_MAX_LEN } from '@alliance/contract/match.js';
import { useEffect, useState } from 'react';
import { PAGE } from '../infra/router/page.js';
import { useCatalog, useSettings } from '../infra/store/hook.js';
import {
  KEY_ACTIONS,
  type KeyAction,
  QUALITIES,
  type Quality,
  settingsStore,
} from '../infra/store/settings.js';
import { dataName, useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import { AudioSettings, Settings } from '../shell/settings.js';
import styles from '../shell/shell.module.css';
import { Button, ChoiceGroup, Panel, TextField } from '../ui/index.js';

function KeyBinding({
  action,
  code,
}: {
  readonly action: KeyAction;
  readonly code: string;
}) {
  const t = useText();
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      setWaiting(false);
      if (event.code !== 'Escape') {
        const keys = settingsStore.getState().keys;
        settingsStore.setState({ keys: { ...keys, [action]: event.code } });
      }
    };
    window.addEventListener('keydown', onKey, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [waiting, action]);
  return (
    <li className={cx(styles.binding)}>
      <span>{t(`core:profile.key.${action}`)}</span>
      <Button onPress={() => setWaiting(true)} aria-live="polite">
        {waiting ? t('core:profile.key.waiting') : code.replace(/^Key/, '')}
      </Button>
    </li>
  );
}

const AVATAR_CHOICES = 12;

export function ProfilePage() {
  const t = useText();
  const { name, avatar, quality, keys } = useSettings((state) => ({
    name: state.name,
    avatar: state.avatar,
    quality: state.quality,
    keys: state.keys,
  }));
  const chess = useCatalog((state) =>
    Object.keys(state.catalog.chess).slice(0, AVATAR_CHOICES),
  );
  return (
    <section data-part={PAGE.profile} className={cx(styles.page)}>
      <h1>{t('core:nav.profile')}</h1>
      <TextField
        label={t('core:title.name')}
        value={name}
        maxLength={NAME_MAX_LEN}
        onChange={(value) => settingsStore.setState({ name: value })}
      />
      <ChoiceGroup
        label={t('core:profile.avatar')}
        value={avatar}
        onChange={(value) => settingsStore.setState({ avatar: value })}
        options={[
          { value: '', label: t('core:profile.avatar.initial') },
          ...chess.map((id) => ({ value: id, label: dataName('chess', id) })),
        ]}
      />
      <Settings />
      <AudioSettings />
      <ChoiceGroup
        label={t('core:profile.quality')}
        value={quality}
        onChange={(value) =>
          settingsStore.setState({ quality: value as Quality })
        }
        options={QUALITIES.map((value) => ({
          value,
          label: t(`core:profile.quality.${value}`),
        }))}
      />
      <Panel title={t('core:profile.keys')}>
        <ul className={cx(styles.bindings)}>
          {KEY_ACTIONS.map((action) => (
            <KeyBinding key={action} action={action} code={keys[action]} />
          ))}
        </ul>
      </Panel>
      <p>{t('core:profile.local')}</p>
    </section>
  );
}
