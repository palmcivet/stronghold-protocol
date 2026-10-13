import { expectTypeOf, test } from 'vitest';
import type { S2CType } from '../src/message.js';
import type {
  LayerMessage,
  ServerMessage,
  ServerMessageOf,
  TickerMessage,
} from '../src/server-message.js';

test('every server push has a payload type', () => {
  expectTypeOf<ServerMessage['t']>().toEqualTypeOf<S2CType>();
});

test('a payload is picked by its type', () => {
  expectTypeOf<ServerMessageOf<'m.layer'>>().toExtend<LayerMessage>();
  expectTypeOf<ServerMessageOf<'m.ticker'>>().toExtend<TickerMessage>();
  expectTypeOf<ServerMessageOf<'ok'>['rid']>().toEqualTypeOf<number>();
});
