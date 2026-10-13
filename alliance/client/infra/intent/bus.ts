import { validateC2S } from '@alliance/contract/message.js';
import type { Connection, Frame } from '../connection/socket.js';
import { RequestError } from '../connection/socket.js';

/** A `g.*` or `room.*` message the interface asks for. */
export interface Intent {
  readonly type: string;
  readonly fields?: Readonly<Record<string, unknown>>;
}

/** Why an intent did not reach the server, or the server's refusal. */
export type IntentOutcome =
  | { readonly ok: true; readonly reply: Frame }
  | { readonly ok: false; readonly error: RequestError };

export type IntentListener = (intent: Intent, outcome: IntentOutcome) => void;

export interface IntentBus {
  /** Checks the intent locally, then sends it and waits for the server's answer. Never rejects. */
  dispatch(intent: Intent): Promise<IntentOutcome>;
  /** Whether the intent passes the local checks. The server still decides. */
  preview(intent: Intent): string | null;
  onOutcome(listener: IntentListener): () => void;
}

export function createIntentBus(connection: Connection): IntentBus {
  const listeners = new Set<IntentListener>();
  const preview = (intent: Intent): string | null =>
    validateC2S({ ...intent.fields, t: intent.type });

  return {
    preview,
    async dispatch(intent) {
      let outcome: IntentOutcome;
      const refused = preview(intent);
      if (refused !== null) {
        outcome = { ok: false, error: new RequestError('BAD_MSG', refused) };
      } else {
        try {
          outcome = {
            ok: true,
            reply: await connection.request(intent.type, intent.fields),
          };
        } catch (failure) {
          outcome = {
            ok: false,
            error:
              failure instanceof RequestError
                ? failure
                : new RequestError('INTERNAL', String(failure)),
          };
        }
      }
      for (const listener of [...listeners]) {
        listener(intent, outcome);
      }
      return outcome;
    },
    onOutcome(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
