import type { CatalogBond } from '@alliance/contract/catalog.js';
import { Badge, Cluster, cx, Icon, Stack, Text, Tooltip } from '@alliance/ui';
import { useMatch, useMatchCatalog } from '#infra/store/hook.js';
import { dataName, shownName, useText } from '#infra/text/index.js';
import { BondIcon, ChessThumb } from '#part/art.js';
import { type MatchInfoModel, matchInfoModel } from './info-model.js';
import styles from './match.module.css';

/** Shared by every render without the lists, so the selection stays equal. */
const NONE: readonly never[] = [];

/** The banned members of a bond, each with its bonds (this one stressed): the box of the bond's tip. */
function BannedMembers({
  bond,
  banned,
}: {
  readonly bond: CatalogBond;
  readonly banned: ReadonlySet<string>;
}) {
  const t = useText();
  const catalog = useMatchCatalog();
  const ids = (bond.members ?? []).filter((id) => banned.has(id));
  return (
    <Stack gap={1}>
      <strong>{t('core:briefing.bannedOps')}</strong>
      {ids.map((id) => (
        <Cluster key={id} gap={2}>
          <ChessThumb chessId={id} size="sm" />
          <Stack gap={1}>
            <span>{shownName('chess', id)}</span>
            <Text kind="muted">
              {(catalog.chess[id]?.bondIds ?? [])
                .filter((other) => catalog.bonds[other])
                .map((other, index) => (
                  <span key={other}>
                    {index ? ' · ' : ''}
                    {other === bond.id ? (
                      <strong>{shownName('bond', other)}</strong>
                    ) : (
                      shownName('bond', other)
                    )}
                  </span>
                ))}
            </Text>
          </Stack>
        </Cluster>
      ))}
    </Stack>
  );
}

/** One row of bond icons: greyed when off or drawn off, with the count of banned members. */
function BondRow({
  title,
  bonds,
  model,
}: {
  readonly title: string;
  readonly bonds: readonly CatalogBond[];
  readonly model: MatchInfoModel;
}) {
  const t = useText();
  if (!bonds.length) {
    return null;
  }
  return (
    <Stack gap={2}>
      <strong>{title}</strong>
      <ul className={cx(styles.bondRow)}>
        {bonds.map((bond) => {
          const name = shownName('bond', bond.id);
          const state = model.stateOf(bond.id);
          const banned = model.bannedOf(bond.id);
          const tip =
            state === 'off'
              ? t('core:briefing.bondOff', { name })
              : banned > 0
                ? t('core:briefing.bondBanned', { name, count: banned })
                : state === 'drawn'
                  ? t('core:briefing.bondDrawn', { name })
                  : name;
          return (
            <li
              key={bond.id}
              className={cx(styles.bondCell)}
              data-state={state ?? (banned > 0 ? 'partial' : undefined)}
            >
              <Tooltip
                label={tip}
                tip={
                  <Stack gap={2}>
                    <span>{tip}</span>
                    {banned > 0 ? (
                      <BannedMembers bond={bond} banned={model.bannedSet} />
                    ) : null}
                  </Stack>
                }
              >
                <BondIcon bondId={bond.id} size="sm" />
                {banned > 0 ? (
                  <span className={cx(styles.bondBan)} aria-hidden="true">
                    <Icon name="user" />
                    {banned}
                  </span>
                ) : null}
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </Stack>
  );
}

/**
 * This match's information, as master's MatchInfo: the core and add-on bond rows, the legend, the banned operators;
 * with `factions`, the special enemies first (the HUD's info tab). One part wherever it shows.
 */
export function MatchInfo({
  factions: showFactions = true,
}: {
  readonly factions?: boolean;
}) {
  const t = useText();
  const view = useMatch((state) => state.public);
  const factions = useMatch((state) => state.public?.factions ?? NONE);
  const catalog = useMatchCatalog();
  const diyOut = useMatch((state) => {
    const picks = state.private?.diy ?? {};
    return (state.private?.diyBanned ?? NONE).flatMap((slot) => {
      const charId = picks[slot]?.charId;
      return charId ? [charId] : [];
    });
  });
  if (!view) {
    return null;
  }
  const model = matchInfoModel(view, catalog);
  return (
    <Stack>
      {showFactions ? (
        <Stack gap={2}>
          <strong>{t('core:info.factions')}</strong>
          {factions.length ? (
            <Cluster gap={2}>
              {factions.map((id) => (
                <Badge shape="pill" key={id} icon="shield">
                  {shownName('faction', id)}
                </Badge>
              ))}
            </Cluster>
          ) : (
            <Text kind="muted">{t('core:info.none')}</Text>
          )}
        </Stack>
      ) : null}
      <BondRow
        title={t('core:briefing.coreBonds')}
        bonds={model.core}
        model={model}
      />
      <BondRow
        title={t('core:briefing.addonBonds')}
        bonds={model.addon}
        model={model}
      />
      <Text kind="muted">
        {t('core:briefing.legend')}
        {model.modeOff ? t('core:briefing.legendOff') : ''} ·{' '}
        <Icon name="user" /> {t('core:briefing.legendBan')}
      </Text>
      <Stack gap={2}>
        <Cluster gap={2}>
          <strong>{t('core:briefing.bannedOps')}</strong>
          <Text variant="number">{model.banned.length}</Text>
        </Cluster>
        {model.banned.length ? (
          <Cluster gap={2}>
            {model.banned.map((id) => {
              const tier = catalog.chess[id]?.tier;
              return (
                <ChessThumb
                  key={id}
                  chessId={id}
                  size="sm"
                  {...(tier === undefined ? {} : { tier })}
                />
              );
            })}
          </Cluster>
        ) : (
          <Text kind="muted">{t('core:briefing.noBanned')}</Text>
        )}
        {diyOut.length ? (
          <p data-part="core:match.info.diy">
            <Badge shape="pill">{t('core:briefing.diyTag')}</Badge>{' '}
            {t('core:briefing.diyBanned', {
              names: diyOut
                .map((charId) => dataName('operator', charId))
                .join('、'),
            })}
          </p>
        ) : null}
      </Stack>
    </Stack>
  );
}
