import { Button, Cluster, Dialog } from '@alliance/ui';
import { useStore } from 'zustand';
import { useIntent } from '#infra/intent/context.js';
import { useMatch, useSession } from '#infra/store/hook.js';
import { dataName, useText } from '#infra/text/index.js';
import { equipStore } from '#match/equip.js';
import { Choices } from './choice.js';

/** The pick-one offers, as a modal while one is open. */
export function Choice() {
  const t = useText();
  const alive = useMatch((state) => state.private?.alive === true);
  const personal = useMatch((state) => state.private?.personalChoice ?? null);
  // the shared pick of the SP draft
  const sp = useMatch((state) => state.public?.sp ?? null);
  if (!personal && !sp) {
    return null;
  }
  return (
    <Dialog isOpen dismissable={false} title={t('core:choice.heading')}>
      <Choices canAct={alive} />
    </Dialog>
  );
}

export function EquipReplace() {
  const t = useText();
  const intents = useIntent();
  const request = useStore(equipStore, (state) => state.request);
  if (!request) {
    return null;
  }
  const close = (): void => equipStore.setState({ request: null });
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && close()}
      title={t('core:equip.heading')}
      closeLabel={t('core:common.cancel')}
    >
      <p>{t('core:equip.hint')}</p>
      <Cluster gap={2}>
        {request.items.map((item) => (
          <Button
            key={item.uid}
            onPress={() => {
              close();
              void intents.dispatch({
                type: 'g.equip',
                fields: {
                  itemUid: request.itemUid,
                  targetUid: request.targetUid,
                  replaceUid: item.uid,
                },
              });
            }}
          >
            {dataName('item', item.id)}
          </Button>
        ))}
      </Cluster>
    </Dialog>
  );
}

/** The solo pause cover; any player may resume. */
export function Pause() {
  const t = useText();
  const intents = useIntent();
  const paused = useMatch((state) => state.public?.paused === true);
  const own = useMatch((state) => state.private !== null);
  if (!paused) {
    return null;
  }
  return (
    <Dialog
      isOpen
      dismissable={false}
      title={t('core:match.paused')}
      actions={
        own ? (
          <Button
            variant="primary"
            onPress={() =>
              void intents.dispatch({
                type: 'g.pause',
                fields: { on: false },
              })
            }
          >
            {t('core:match.resume')}
          </Button>
        ) : undefined
      }
    />
  );
}

/** The away cover while the AI plays for the player. */
export function Away() {
  const t = useText();
  const intents = useIntent();
  const playerId = useSession((state) => state.playerId);
  const away = useMatch(
    (state) =>
      state.public?.players.find((player) => player.playerId === playerId)
        ?.autoplay === true,
  );
  if (!away) {
    return null;
  }
  return (
    <Dialog
      isOpen
      dismissable={false}
      title={t('core:match.away')}
      actions={
        <Button
          variant="primary"
          onPress={() =>
            void intents.dispatch({
              type: 'g.autoplay',
              fields: { on: false },
            })
          }
        >
          {t('core:match.back')}
        </Button>
      }
    >
      <p>{t('core:match.awayHint')}</p>
    </Dialog>
  );
}

/** The opening reroll vote. The contract has no vote message yet, so nothing shows. */
/** The vote to reroll the match setup: voters agree or refuse, the host who proposed it may withdraw it. */
export function Vote() {
  const t = useText();
  const intents = useIntent();
  const vote = useMatch((state) => state.public?.rerollVote ?? null);
  const names = useMatch((state) => state.public?.players ?? []);
  const playerId = useSession((state) => state.playerId);
  if (!vote) {
    return null;
  }
  const nameOf = (id: string): string =>
    names.find((player) => player.playerId === id)?.name ?? id;
  const voter = vote.voters.includes(playerId ?? '');
  const agreed = vote.agreed.includes(playerId ?? '');
  const answer = (agree: boolean): void =>
    void intents.dispatch({
      type: 'g.rerollVote',
      fields: { voteId: vote.id, agree },
    });
  return (
    <Dialog isOpen dismissable={false} title={t('core:vote.heading')}>
      <p>{t('core:vote.proposed', { name: nameOf(vote.proposerId) })}</p>
      <p>
        {t('core:vote.count', {
          agreed: vote.agreed.length,
          total: vote.voters.length,
        })}
      </p>
      <Cluster gap={2}>
        {voter && !agreed ? (
          <>
            <Button variant="primary" onPress={() => answer(true)}>
              {t('core:vote.agree')}
            </Button>
            <Button onPress={() => answer(false)}>
              {t('core:vote.refuse')}
            </Button>
          </>
        ) : null}
        {vote.proposerId === playerId ? (
          <Button
            onPress={() =>
              void intents.dispatch({
                type: 'room.cancelReroll',
                fields: { voteId: vote.id },
              })
            }
          >
            {t('core:vote.cancel')}
          </Button>
        ) : null}
      </Cluster>
    </Dialog>
  );
}
