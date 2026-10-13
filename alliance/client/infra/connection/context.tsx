import { createContext, useContext } from 'react';
import type { Connection } from './socket.js';

/** The page's connection, for the parts that act on it (the banner's retry). */
export const ConnectionContext = createContext<Connection | null>(null);

export function useConnection(): Connection | null {
  return useContext(ConnectionContext);
}
