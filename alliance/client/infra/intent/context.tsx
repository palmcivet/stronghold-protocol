import { createContext, useContext } from 'react';
import type { IntentBus } from './bus.js';

export const IntentContext = createContext<IntentBus | null>(null);

export function useIntent(): IntentBus {
  const bus = useContext(IntentContext);
  if (!bus) {
    throw new Error('useIntent needs an IntentContext provider');
  }
  return bus;
}
