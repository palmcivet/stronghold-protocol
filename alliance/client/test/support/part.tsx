import { type RenderResult, render } from '@testing-library/react';
import { registerAllParts } from '../../infra/boot/parts.js';
import type { IntentBus } from '../../infra/intent/bus.js';
import { IntentContext } from '../../infra/intent/context.js';
import { Part } from '../../part/registry.js';
import { FeedbackProvider, type PlayFeedback } from '../../ui/feedback.js';

const quiet: PlayFeedback = () => {};

// every page's parts, the route-loaded ones too
await registerAllParts();

/** Renders a registered part by id, with the host's parts registered and the intent bus provided. */
export function renderPart(
  id: string,
  {
    bus,
    play = quiet,
    props = {},
  }: {
    readonly bus?: IntentBus;
    readonly play?: PlayFeedback;
    readonly props?: Readonly<Record<string, unknown>>;
  } = {},
): RenderResult {
  const node = (
    <FeedbackProvider play={play}>
      <Part id={id} {...props} />
    </FeedbackProvider>
  );
  return render(
    bus ? (
      <IntentContext.Provider value={bus}>{node}</IntentContext.Provider>
    ) : (
      node
    ),
  );
}
