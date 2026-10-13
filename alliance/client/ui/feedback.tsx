import { createContext, type ReactNode, useContext } from 'react';

/** Plays a short interface sound. The host provides the sink; without one the call is a no-op. */
export type PlayFeedback = (role: 'ui.click' | 'ui.tab') => void;

const FeedbackContext = createContext<PlayFeedback>(() => {});

/** Provides the click and tab sounds the host plays for base controls. */
export function FeedbackProvider({
  play,
  children,
}: {
  readonly play: PlayFeedback;
  readonly children: ReactNode;
}) {
  return (
    <FeedbackContext.Provider value={play}>{children}</FeedbackContext.Provider>
  );
}

export function useFeedback(): PlayFeedback {
  return useContext(FeedbackContext);
}
