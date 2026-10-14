import { APP_VERSION, NAME_MAX_LEN } from '@alliance/contract/match.js';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { keymapStore } from '#infra/intent/keymap.js';
import { getPlatform } from '#infra/platform/index.js';
import { avatarVariants } from '#infra/resource/art.js';
import {
  AUDIO_CHANNELS,
  PROFILE_TABS,
  QUALITIES,
  type Quality,
  registerOfficialSettings,
  SECTION,
  setChannel,
  settingsStore,
  TEXT_SIZES,
  type TextSize,
} from '#infra/settings/index.js';
import { assetsStore } from '#infra/store/assets.js';
import { useCatalog, useSession, useSettings } from '#infra/store/hook.js';
import {
  dataName,
  has,
  LANGUAGES,
  type Language,
  lookup,
  shownName,
  useText,
} from '#infra/text/index.js';
import { cx } from '#infra/theme/class-name.js';
import { PlayerAvatar } from '#part/art.js';
import { DIALOG } from '#part/dialog.js';
import { definePart } from '#part/registry.js';
import { insertPart } from '#part/slot.js';
import { PartTabs } from '#part/tabs.js';
import {
  Button,
  ChoiceGroup,
  Cluster,
  Hotkey,
  Item,
  Muted,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
} from '#ui/index.js';
import styles from './profile.module.css';

export const PROFILE = {
  tabs: PROFILE_TABS,
  identity: SECTION.identity,
  language: 'core:profile.language',
  keys: SECTION.keys,
  display: SECTION.display,
  audio: SECTION.audio,
  feedback: 'core:profile.feedback',
} as const;

const AVATAR_CHOICES = 12;

const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  'zh-Hans': '简体中文',
  en: 'English',
};

/** The text of an avatar variant label; a label the catalog has no text for is shown as another look. */
export function variantLabel(label: string, name: string): string {
  const key = `core:profile.avatar.variant.${label}`;
  return lookup(has(key) ? key : 'core:profile.avatar.variant.other', { name });
}

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
          ...variants.map(({ charId, key, label }) => ({
            value: key,
            label: variantLabel(label, operatorName(charId)),
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

/** Waits for the next key and binds it to the action; the table lives in `#infra/intent/keymap`. */
function KeyBindingRow({
  id,
  label,
  defaults,
}: {
  readonly id: string;
  readonly label: `${string}:${string}`;
  readonly defaults: readonly string[];
}) {
  const t = useText();
  const [waiting, setWaiting] = useState(false);
  const changed = useSettings((state) => state.keymap[id]);
  const code = (changed ?? defaults)[0] ?? null;
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      setWaiting(false);
      if (event.code !== 'Escape') {
        const { keymap } = settingsStore.getState();
        settingsStore.setState({ keymap: { ...keymap, [id]: [event.code] } });
      }
    };
    window.addEventListener('keydown', onKey, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [waiting, id]);
  return (
    <Item>
      <span>{lookup(label)}</span>
      <Button onPress={() => setWaiting(true)} aria-live="polite">
        {waiting ? (
          t('core:profile.key.waiting')
        ) : code ? (
          <Hotkey code={code} />
        ) : (
          '—'
        )}
      </Button>
    </Item>
  );
}

function Keys() {
  const t = useText();
  const actions = useStore(keymapStore, (state) => state.bindings);
  return (
    <Stack>
      <Stack as="ul" gap={2}>
        {actions.map((action) => (
          <KeyBindingRow
            key={action.id}
            id={action.id}
            label={action.label}
            defaults={action.keys}
          />
        ))}
      </Stack>
      <Muted>{t('core:profile.key.hint')}</Muted>
    </Stack>
  );
}

function Display() {
  const t = useText();
  const { quality, textSize, safeAreaUi } = useSettings((state) => ({
    quality: state.quality,
    textSize: state.textSize,
    safeAreaUi: state.safeAreaUi,
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
      <Switch
        isSelected={safeAreaUi}
        onChange={(on) => settingsStore.setState({ safeAreaUi: on })}
      >
        {t('core:profile.safeAreaUi')}
      </Switch>
      <Muted>{t('core:profile.safeAreaUi.hint')}</Muted>
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
    if (!getPlatform().clipboardWrite) {
      setNote('refused');
      setManual(text);
      return;
    }
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

/** The profile dialog, also the in-match settings: one tab per settings part. */
function ProfileLayout() {
  const t = useText();
  return (
    <section data-part={DIALOG.profile} className={cx(styles.page)}>
      <PartTabs
        id={PROFILE.tabs}
        label={t('core:nav.profile')}
        orientation="vertical"
      />
      <Muted>{t('core:profile.local')}</Muted>
    </section>
  );
}

/** Non-persistent / non-section tabs kept in the profile domain. */
const PROFILE_ONLY = [
  [PROFILE.language, LanguageSetting, 'language', 20],
  [PROFILE.feedback, Feedback, 'feedback', 60],
] as const;

export function registerProfileParts(): readonly (() => void)[] {
  return [
    definePart(DIALOG.profile, ProfileLayout, { extensible: true }),
    ...registerOfficialSettings({
      identity: Identity,
      keys: Keys,
      display: Display,
      audio: Audio,
    }),
    ...PROFILE_ONLY.flatMap(([id, component, tab, order]) => [
      definePart(id, component, {
        extensible: true,
        title: `core:profile.tab.${tab}`,
      }),
      insertPart({ into: PROFILE.tabs, id, order }),
    ]),
  ];
}
