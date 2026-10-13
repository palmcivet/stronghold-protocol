import { Link } from '@tanstack/react-router';
import { PAGE } from '../infra/router/page.js';
import { useSession } from '../infra/store/hook.js';
import { useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import { definePart, Part } from '../part/registry.js';
import { type PartInsert, Slot } from '../part/slot.js';
import { Badge, Cluster, Icon, Region } from '../ui/index.js';
import styles from './entry.module.css';
import { CreateRoom, JoinRoom } from './lobby.js';
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
      <Badge tone={online ? 'accent' : 'warn'}>
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
    <Link to="/profile" className={cx(styles.cornerLink)}>
      <Icon name="settings" />
      {t('core:settings.heading')}
    </Link>
  );
}

function GuideLink() {
  const t = useText();
  return (
    <Link to="/guide" className={cx(styles.cornerLink)}>
      <Icon name="info" />
      {t('core:nav.guide')}
    </Link>
  );
}

const CORNER_DEFAULTS: readonly PartInsert[] = [
  { into: ENTRY.corner, id: 'core:profile.language', order: 10 },
  { into: ENTRY.corner, id: ENTRY.settings, order: 20 },
  { into: ENTRY.corner, id: ENTRY.guide, order: 30 },
  { into: ENTRY.corner, id: ENTRY.server, order: 40 },
];

/** The entry page: the title area, the form area and the corner. */
function EntryLayout() {
  const entered = useSession((state) => state.entered);
  return (
    <section data-part={PAGE.entry} className={cx(styles.layout)}>
      <Region name="hero" className={cx(styles.heroRegion)}>
        <Part id={ENTRY.hero} />
      </Region>
      <Region name="form" className={cx(styles.formRegion)}>
        {entered ? (
          <>
            <Part id={ENTRY.create} />
            <Part id={ENTRY.join} />
          </>
        ) : (
          <Part id={ENTRY.name} />
        )}
      </Region>
      <Region name="corner" className={cx(styles.cornerRegion)}>
        <Slot id={ENTRY.corner} defaults={CORNER_DEFAULTS} />
      </Region>
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
  ];
}
