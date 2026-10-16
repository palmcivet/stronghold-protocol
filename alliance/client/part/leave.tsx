import { Button } from '@alliance/ui';
import { useNavigate } from '@tanstack/react-router';
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
} from 'react';
import { useStore } from 'zustand';
import { presenceStore } from '#infra/store/presence.js';
import { useText } from '#infra/text/index.js';

/** A leave control that takes the label the caller wants on the open button. */
export type LeaveControl = ComponentType<{ readonly label?: string }>;

const LeaveContext = createContext<LeaveControl | null>(null);

/** Provides the leave control the host uses when a part needs to go back to the lobby. */
export function LeaveProvider({
  Leave,
  children,
}: {
  readonly Leave: LeaveControl;
  readonly children: ReactNode;
}) {
  return (
    <LeaveContext.Provider value={Leave}>{children}</LeaveContext.Provider>
  );
}

/** Back to the lobby the way the state machine allows: through the leave flow while the server holds the player in a room. */
export function BackToLobby() {
  const t = useText();
  const navigate = useNavigate();
  const Leave = useContext(LeaveContext);
  const inRoom = useStore(presenceStore, (state) => 'code' in state.presence);
  if (inRoom && Leave) {
    return <Leave label={t('core:error.lobby')} />;
  }
  return (
    <Button onPress={() => void navigate({ to: '/' })}>
      {t('core:error.lobby')}
    </Button>
  );
}
