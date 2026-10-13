import { useMatch, useMatchCatalog } from '../infra/store/hook.js';
import { shownName, useText } from '../infra/text/index.js';
import { ChessThumb } from '../part/art.js';
import { Chip, Cluster, Muted, Stack } from '../ui/index.js';

/** Shared by every render without the lists, so the selection stays equal. */
const NONE: readonly never[] = [];

/** This match's information: factions, the bonds switched off, the operators banned. One part wherever it shows. */
export function MatchInfo() {
  const t = useText();
  const { factions, disabled, banned } = useMatch((state) => ({
    factions: state.public?.factions ?? NONE,
    disabled: state.public?.disabledBonds ?? NONE,
    banned: state.public?.bannedChess ?? NONE,
  }));
  const catalog = useMatchCatalog();
  return (
    <Stack>
      <Stack gap={2}>
        <strong>{t('core:info.factions')}</strong>
        {factions.length ? (
          <Cluster gap={2}>
            {factions.map((id) => (
              <Chip key={id} icon="shield">
                {shownName('faction', id)}
              </Chip>
            ))}
          </Cluster>
        ) : (
          <Muted>{t('core:info.none')}</Muted>
        )}
      </Stack>
      <Stack gap={2}>
        <strong>{t('core:info.disabledBonds')}</strong>
        {disabled.length ? (
          <Cluster gap={2}>
            {disabled.map((id) => (
              <Chip key={id}>{shownName('bond', id)}</Chip>
            ))}
          </Cluster>
        ) : (
          <Muted>{t('core:info.none')}</Muted>
        )}
      </Stack>
      <Stack gap={2}>
        <strong>{t('core:info.banned', { count: banned.length })}</strong>
        {banned.length ? (
          <Cluster gap={2}>
            {banned.map((id) => {
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
          <Muted>{t('core:info.none')}</Muted>
        )}
      </Stack>
    </Stack>
  );
}
