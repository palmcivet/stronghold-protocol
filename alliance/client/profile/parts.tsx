import { APP_VERSION, NAME_MAX_LEN } from '@alliance/contract/match.js';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { avatarVariants } from '../infra/resource/art.js';
import { PAGE } from '../infra/router/page.js';
import { assetsStore } from '../infra/store/assets.js';
import { useCatalog, useSession, useSettings } from '../infra/store/hook.js';
import {
  AUDIO_CHANNELS,
  KEY_ACTIONS,
  type KeyAction,
  QUALITIES,
  type Quality,
  setChannel,
  settingsStore,
  TEXT_SIZES,
  type TextSize,
} from '../infra/store/settings.js';
import {
  dataName,
  LANGUAGES,
  type Language,
  shownName,
  useText,
} from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import { PlayerAvatar } from '../part/art.js';
import { definePart } from '../part/registry.js';
import { insertPart } from '../part/slot.js';
import { PartTabs } from '../part/tabs.js';
import {
  Button,
  ChoiceGroup,
  Cluster,
  Hotkey,
  Item,
  Muted,
  Screen,
  Slider,
  Stack,
  TextField,
  ToggleButton,
} from '../ui/index.js';
import styles from './profile.module.css';

export const PROFILE = {
  tabs: 'core:profile.tabs',
  identity: 'core:profile.identity',
  language: 'core:profile.language',
  keys: 'core:profile.keys',
  display: 'core:profile.display',
  audio: 'core:profile.audio',
  feedback: 'core:profile.feedback',
} as const;

const AVATAR_CHOICES = 12;

const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  'zh-Hans': '简体中文',
  en: 'English',
};

function Identity() {
  const t = useText();
  const { name, avatar } = useSettings((state) => ({
    name: state.name,
    avatar: state.avatar,
  }));
  const catalog = useCatalog((state) => state.catalog);
  const resources = useStore(assetsStore, (state) => state.resources);
  const variants = useMemo(() => {
    const charIds = [
      ...new Set(
        Object.values(catalog.chess)
          .filter((chess) => chess.visible && !chess.golden)
          .map((chess) => chess.charId)
          .filter((id): id is string => id !== null),
      ),
    ].slice(0, AVATAR_CHOICES);
    return avatarVariants(resources, charIds);
  }, [catalog, resources]);
  const operatorName = (charId: string): string => {
    const chess = Object.values(catalog.chess).find(
      (entry) => entry.charId === charId,
    );
    return chess ? dataName('chess', chess.id) : shownName('operator', charId);
  };
  return (
    <Stack>
      <Cluster align="end">
        <PlayerAvatar avatar={avatar} name={name || '?'} size="lg" framed />
        <TextField
          label={t('core:title.name')}
          value={name}
          maxLength={NAME_MAX_LEN}
          onChange={(value) => settingsStore.setState({ name: value })}
        />
      </Cluster>
      <ChoiceGroup
        label={t('core:profile.avatar')}
        value={avatar}
        onChange={(value) => settingsStore.setState({ avatar: value })}
        options={[
          { value: '', label: t('core:profile.avatar.initial') },
          ...variants.map(({ charId, field }) => ({
            value: `${charId}:${field}`,
            label: t(`core:profile.avatar.variant.${field}`, {
              name: operatorName(charId),
            }),
          })),
        ]}
      />
    </Stack>
  );
}

/** The interface language; the entry page's corner shows the same part. */
function LanguageSetting() {
  const t = useText();
  const language = useSettings((state) => state.language);
  return (
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
  );
}

/** Waits for the next key and binds it to the action. */
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
    <Item>
      <span>{t(`core:profile.key.${action}`)}</span>
      <Button onPress={() => setWaiting(true)} aria-live="polite">
        {waiting ? t('core:profile.key.waiting') : <Hotkey code={code} />}
      </Button>
    </Item>
  );
}

function Keys() {
  const t = useText();
  const keys = useSettings((state) => state.keys);
  return (
    <Stack>
      <Stack as="ul" gap={2}>
        {KEY_ACTIONS.map((action) => (
          <KeyBinding key={action} action={action} code={keys[action]} />
        ))}
      </Stack>
      <Muted>{t('core:profile.key.hint')}</Muted>
    </Stack>
  );
}

function Display() {
  const t = useText();
  const { quality, textSize } = useSettings((state) => ({
    quality: state.quality,
    textSize: state.textSize,
  }));
  return (
    <Stack>
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
      <ChoiceGroup
        label={t('core:profile.textSize')}
        value={textSize}
        onChange={(value) =>
          settingsStore.setState({ textSize: value as TextSize })
        }
        options={TEXT_SIZES.map((value) => ({
          value,
          label: t(`core:profile.textSize.${value}`),
        }))}
      />
      <Muted>{t('core:profile.textSize.hint')}</Muted>
    </Stack>
  );
}

/** Volume and mute of the master, music and sound effect channels. */
function Audio() {
  const t = useText();
  const audio = useSettings((state) => state.audio);
  return (
    <Stack as="ul" gap={2}>
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
    </Stack>
  );
}

export const ISSUES_URL =
  'https://github.com/sganggs/Stronghold-Protocol/issues';

/** Diagnostics of this page for a bug report. Names and room codes are left out. */
export function diagnosticsText(input: {
  readonly path: string;
  readonly status: string;
  readonly mode: string | null;
  readonly language: string;
  readonly agent: string;
}): string {
  return [
    `version: ${APP_VERSION}`,
    `backend: ${input.mode ?? 'none'} (${input.status})`,
    `page: ${input.path.replace(/\/room\/[A-Za-z0-9]+/, '/room/****')}`,
    `language: ${input.language}`,
    `agent: ${input.agent}`,
  ].join('\n');
}

function Feedback() {
  const t = useText();
  const { status, mode } = useSession((state) => ({
    status: state.connection.status,
    mode: state.backend?.mode ?? null,
  }));
  const language = useSettings((state) => state.language);
  const [note, setNote] = useState<'copied' | 'refused' | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const copy = async (): Promise<void> => {
    const text = diagnosticsText({
      path: globalThis.location?.pathname ?? '',
      status,
      mode,
      language,
      agent: globalThis.navigator?.userAgent ?? '',
    });
    try {
      await navigator.clipboard.writeText(text);
      setNote('copied');
      setManual(null);
    } catch {
      setNote('refused');
      setManual(text);
    }
  };
  return (
    <Stack>
      <p>{t('core:profile.feedback.hint')}</p>
      <Cluster>
        <Button onPress={() => void copy()}>
          {t('core:profile.feedback.copy')}
        </Button>
        <Muted>{ISSUES_URL.replace(/^https:\/\//, '')}</Muted>
      </Cluster>
      {note ? <p role="status">{t(`core:profile.feedback.${note}`)}</p> : null}
      {manual ? (
        <textarea
          readOnly
          aria-label={t('core:profile.feedback.copy')}
          value={manual}
          className={cx(styles.diag)}
        />
      ) : null}
    </Stack>
  );
}

/** The profile page: one tab per settings part, the same set the in-match settings overlay shows. */
function ProfileLayout() {
  const t = useText();
  return (
    <section data-part={PAGE.profile} className={cx(styles.page)}>
      <Screen title={t('core:nav.profile')}>
        <PartTabs
          id={PROFILE.tabs}
          label={t('core:nav.profile')}
          orientation="vertical"
        />
        <Muted>{t('core:profile.local')}</Muted>
      </Screen>
    </section>
  );
}

/** The settings tabs in order. They go into `core:profile.tabs` as inserts, so every container of that id shows them. */
const TABS = [
  [PROFILE.identity, Identity, 'identity'],
  [PROFILE.language, LanguageSetting, 'language'],
  [PROFILE.keys, Keys, 'keys'],
  [PROFILE.display, Display, 'display'],
  [PROFILE.audio, Audio, 'audio'],
  [PROFILE.feedback, Feedback, 'feedback'],
] as const;

export function registerProfileParts(): readonly (() => void)[] {
  return [
    definePart(PAGE.profile, ProfileLayout, { extensible: true }),
    ...TABS.flatMap(([id, component, tab], index) => [
      definePart(id, component, {
        extensible: true,
        title: `core:profile.tab.${tab}`,
      }),
      insertPart({ into: PROFILE.tabs, id, order: (index + 1) * 10 }),
    ]),
  ];
}
