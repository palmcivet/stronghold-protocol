import { expectTypeOf, test } from 'vitest';
import type { S2CType, UnitStatsEntry } from '../src/message.js';
import type {
  BattlePoolMessage,
  BattleStartMessage,
  BossMateView,
  FieldMessage,
  FieldUnitView,
  LayerMessage,
  PlayerView,
  PrivateOpsEntry,
  PrivateView,
  PublicView,
  ServerMessage,
  ServerMessageOf,
  TickerMessage,
  UnitePlanView,
  UniteResultView,
  UnitStatsMessage,
  WelcomeExt,
  WelcomeMessage,
} from '../src/server-message.js';

test('every server push has a payload type', () => {
  expectTypeOf<ServerMessage['t']>().toEqualTypeOf<S2CType>();
});

test('a payload is picked by its type', () => {
  expectTypeOf<ServerMessageOf<'m.layer'>>().toExtend<LayerMessage>();
  expectTypeOf<ServerMessageOf<'m.ticker'>>().toExtend<TickerMessage>();
  expectTypeOf<ServerMessageOf<'ok'>['rid']>().toEqualTypeOf<number>();
});

test('welcome.ext and field / private views expose the master 0.2.6 shapes', () => {
  expectTypeOf<WelcomeExt>().toExtend<{
    seasonId?: string;
    contentHash?: string;
    dataHash?: string;
  }>();
  expectTypeOf<WelcomeMessage['ext']>().toEqualTypeOf<WelcomeExt | undefined>();
  expectTypeOf<FieldMessage>().toExtend<{
    prep?: boolean;
    units?: readonly FieldUnitView[];
    side?: 'L' | 'R';
  }>();
  expectTypeOf<PlayerView>().toExtend<{
    pendingLp?: number;
    uniteLeft?: number;
  }>();
  expectTypeOf<PrivateView>().toExtend<{
    ops?: Readonly<Record<string, PrivateOpsEntry>>;
    bossMate?: BossMateView;
  }>();
  expectTypeOf<PublicView>().toExtend<{
    overtimeAt?: number;
    unite?: UnitePlanView;
    uniteResult?: UniteResultView;
  }>();
  expectTypeOf<BattleStartMessage>().toExtend<{
    watch: boolean;
    done: boolean;
    authoritative: boolean;
  }>();
  expectTypeOf<BattlePoolMessage>().toExtend<{
    acked: Readonly<Record<string, number>>;
  }>();
  expectTypeOf<UnitStatsMessage>().toExtend<{
    units: readonly UnitStatsEntry[];
  }>();
});
