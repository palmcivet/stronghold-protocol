import { useStore } from 'zustand';
import { useMatch, useMatchCatalog } from '../../infra/store/hook.js';
import { dataName, has, lookup, useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { PieceThumb } from '../../part/art.js';
import {
  Badge,
  Button,
  Chip,
  Cluster,
  Icon,
  RichText,
  Stack,
  TierChip,
} from '../../ui/index.js';
import { cardName } from '../piece-label.js';
import { findPiece, selectionStore } from '../selection.js';
import styles from './hud.module.css';
import { hudStore } from './state.js';

/** The detail card of the picked operator or item: tier, elite, bonds, equipment, description. */
export function Detail() {
  const t = useText();
  const view = useMatch((state) => state.private);
  const uid = useStore(selectionStore, (state) => state.uid);
  const catalog = useMatchCatalog();
  const located = findPiece(view, uid);
  if (!located) {
    return null;
  }
  const { piece } = located;
  const chess = piece.kind === 'chess' ? catalog.chess[piece.id] : undefined;
  const tier = piece.tier ?? chess?.tier ?? catalog.items[piece.id]?.tier;
  const name = cardName(piece);
  const descKey = piece.kind === 'item' ? `data:item.${piece.id}.desc` : '';
  return (
    <section className={cx(styles.float, styles.detail)} aria-label={name}>
      <Cluster justify="between">
        <Cluster gap={2}>
          <PieceThumb
            kind={piece.kind === 'item' ? 'item' : 'chess'}
            id={piece.id}
            elite={piece.golden === true}
            {...(tier === undefined ? {} : { tier })}
          />
          <Stack gap={1}>
            <strong>{name}</strong>
            <Cluster gap={1}>
              {tier === undefined ? null : <TierChip tier={tier} />}
              {piece.golden ? (
                <Badge tone="gold">{t('core:unit.golden')}</Badge>
              ) : null}
              {chess?.profession ? <Badge>{chess.profession}</Badge> : null}
            </Cluster>
          </Stack>
        </Cluster>
        <Button
          aria-label={t('core:common.close')}
          onPress={() => selectionStore.setState({ uid: null })}
        >
          <Icon name="close" />
        </Button>
      </Cluster>
      {chess?.bondIds.length ? (
        <Cluster gap={1} label={t('core:bonds.heading')}>
          {chess.bondIds.map((id) => (
            <Button key={id} onPress={() => hudStore.setState({ bond: id })}>
              <Chip>{dataName('bond', id)}</Chip>
            </Button>
          ))}
        </Cluster>
      ) : null}
      {piece.items?.length ? (
        <Cluster gap={1} label={t('core:detail.items')}>
          {piece.items.map((item) => (
            <Chip key={item.uid}>{dataName('item', item.id)}</Chip>
          ))}
        </Cluster>
      ) : null}
      {descKey && has(descKey) ? <RichText source={lookup(descKey)} /> : null}
    </section>
  );
}
