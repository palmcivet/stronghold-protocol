import { Badge, Button, Cluster, cx, Icon, Region } from '@alliance/ui';
import { PAGE } from '#infra/router/page.js';
import { useSession, useSettings } from '#infra/store/hook.js';
import { sessionStore } from '#infra/store/session.js';
import { useText } from '#infra/text/index.js';
import { PlayerAvatar } from '#part/art.js';
import { PingBadge } from '#part/badge.js';
import { DIALOG, openDialog } from '#part/dialog.js';
import { definePart, Part } from '#part/registry.js';
import { type PartInsert, Slot } from '#part/slot.js';
import { MENU_ENTRY } from '#shell/menu.js';
import styles from './entry.module.css';
import { CreateRoom, JoinRoom } from './lobby.js';
import { ResumeSeat } from './resume.js';
import { NameForm } from './title.js';

export const ENTRY = {
  hero: 'core:entry.hero',
  name: 'core:entry.name',
  create: 'core:entry.create',
  join: 'core:entry.join',
  server: 'core:entry.server',
  corner: 'core:entry.corner',
  settings: 'core:entry.settings',
  guide: 'core:entry.guide',
  resume: 'core:entry.resume',
  topbar: 'core:entry.topbar',
} as const;

function Hero() {
  const t = useText();
  return (
    <div className={cx(styles.hero)}>
      <h1 className={cx(styles.title)}>{t('core:app.title')}</h1>
      <p className={cx(styles.tagline)}>{t('core:entry.tagline')}</p>
    </div>
  );
}

/** The connection's round trip, in the lobby topbar. */
function LobbyPing() {
  const t = useText();
  const { ping, status } = useSession((state) => ({
    ping: state.connection.ping,
    status: state.connection.status,
  }));
  const online = status === 'online';
  return (
    <PingBadge
      ms={ping}
      online={online}
      label={
        online && ping !== null
          ? t('core:entry.ping', { ms: Math.round(ping) })
          : t('core:lobby.ping.offline')
      }
      offlineText={t('core:lobby.ping.offline')}
    />
  );
}

function ServerInfo() {
  const t = useText();
  const { mode, ping, status } = useSession((state) => ({
    mode: state.backend?.mode ?? null,
    ping: state.connection.ping,
    status: state.connection.status,
  }));
  const online = status === 'online';
  return (
    <Cluster gap={2} label={t('core:entry.server')}>
      <Badge tone={online ? 'accent' : 'amber'}>
        {t(`core:entry.status.${online ? 'online' : 'offline'}`)}
      </Badge>
      {mode === null ? null : <span>{t(`core:entry.mode.${mode}`)}</span>}
      {ping === null ? null : (
        <span>{t('core:entry.ping', { ms: Math.round(ping) })}</span>
      )}
    </Cluster>
  );
}

function SettingsLink() {
  const t = useText();
  return (
    <button
      type="button"
      className={cx(styles.cornerLink)}
      onClick={() => void openDialog(DIALOG.profile)}
    >
      <Icon name="settings" />
      {t('core:settings.heading')}
    </button>
  );
}

function GuideLink() {
  const t = useText();
  return (
    <button
      type="button"
      className={cx(styles.cornerLink)}
      onClick={() => void openDialog(DIALOG.guide)}
    >
      <Icon name="info" />
      {t('core:nav.guide')}
    </button>
  );
}

function ToolIcon({
  label,
  icon,
  onPress,
}: {
  readonly label: string;
  readonly icon: 'settings' | 'info';
  readonly onPress: () => void;
}) {
  return (
    <button
      type="button"
      className={cx(styles.toolBtn)}
      aria-label={label}
      title={label}
      onClick={onPress}
    >
      <Icon name={icon} size="calc(var(--wsde-dp) * 16)" />
    </button>
  );
}

/** Master's lobby topbar: back, ping, tools | protocol title | resume, loadout, doctor chip. */
function LobbyTopbar() {
  const t = useText();
  const name = useSession((state) => state.name);
  const avatar = useSettings((state) => state.avatar);
  return (
    <header className={cx(styles.topbar)}>
      <div className={cx(styles.topbarLeft)}>
        <Button
          onPress={() => {
            sessionStore.setState({ entered: false });
          }}
        >
          <Icon name="chevron-left" />
          {t('core:common.back')}
        </Button>
        <LobbyPing />
        <span className={cx(styles.topbarSep)} aria-hidden="true" />
        <div className={cx(styles.topbarTools)}>
          <ToolIcon
            label={t('core:settings.heading')}
            icon="settings"
            onPress={() => void openDialog(DIALOG.profile)}
          />
          <ToolIcon
            label={t('core:nav.guide')}
            icon="info"
            onPress={() => void openDialog(DIALOG.guide)}
          />
        </div>
      </div>
      <div className={cx(styles.topbarCenter)}>
        <span className={cx(styles.micro)}>SIMULATION PROTOCOL SELECT</span>
        <h1 className={cx(styles.protocolTitle)}>{t('core:lobby.protocol')}</h1>
      </div>
      <div className={cx(styles.topbarRight)}>
        <Part id={ENTRY.resume} />
        <Button icon="users" onPress={() => void openDialog(DIALOG.loadout)}>
          {t('core:lobby.loadout')}
        </Button>
        <button
          type="button"
          className={cx(styles.meChip)}
          onClick={() => void openDialog(DIALOG.profile)}
          title={t('core:settings.heading')}
          aria-label={t('core:settings.heading')}
        >
          <PlayerAvatar
            name={name || t('core:resume.noName')}
            avatar={avatar}
            size="sm"
          />
          <span className={cx(styles.meChipText)}>
            <span className={cx(styles.meChipName)}>
              {name || t('core:resume.noName')}
            </span>
            <span className={cx(styles.micro)}>{t('core:lobby.doctor')}</span>
          </span>
        </button>
      </div>
    </header>
  );
}

const CORNER_DEFAULTS: readonly PartInsert[] = [
  { into: ENTRY.corner, id: MENU_ENTRY, order: 5 },
  { into: ENTRY.corner, id: 'core:profile.language', order: 10 },
  { into: ENTRY.corner, id: ENTRY.settings, order: 20 },
  { into: ENTRY.corner, id: ENTRY.guide, order: 30 },
  { into: ENTRY.corner, id: ENTRY.resume, order: 35 },
  { into: ENTRY.corner, id: ENTRY.server, order: 40 },
];

/** The entry page: the title area, the form area and the corner. */
function EntryLayout() {
  const entered = useSession((state) => state.entered);
  return (
    <section data-part={PAGE.entry} className={cx(styles.page)}>
      <div className={cx(styles.layout)} data-entered={entered || undefined}>
        {entered ? (
          <>
            <Part id={ENTRY.topbar} />
            <div className={cx(styles.lobbyScroll)}>
              <Region name="form" className={cx(styles.formRegion)}>
                <Part id={ENTRY.create} />
                <Part id={ENTRY.join} />
              </Region>
            </div>
          </>
        ) : (
          <>
            <Region name="corner" className={cx(styles.cornerRegion)}>
              <Slot id={ENTRY.corner} defaults={CORNER_DEFAULTS} />
            </Region>
            <Region name="hero" className={cx(styles.heroRegion)}>
              <Part id={ENTRY.hero} />
            </Region>
            <Region name="form" className={cx(styles.formRegion)}>
              <Part id={ENTRY.name} />
            </Region>
          </>
        )}
      </div>
    </section>
  );
}

export function registerEntryParts(): readonly (() => void)[] {
  return [
    definePart(PAGE.entry, EntryLayout, { extensible: true }),
    definePart(ENTRY.hero, Hero, { extensible: true }),
    definePart(ENTRY.name, NameForm),
    definePart(ENTRY.create, CreateRoom, { extensible: true }),
    definePart(ENTRY.join, JoinRoom),
    definePart(ENTRY.server, ServerInfo),
    definePart(ENTRY.settings, SettingsLink),
    definePart(ENTRY.guide, GuideLink),
    definePart(ENTRY.resume, ResumeSeat),
    definePart(ENTRY.topbar, LobbyTopbar, { extensible: true }),
  ];
}
