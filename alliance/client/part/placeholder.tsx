import { useText } from '#infra/text/index.js';
import { Placeholder } from '#ui/index.js';

/** A stand-in for a part that is not built yet; it shows its id so the layout can be checked. */
export function placeholderPart(id: string) {
  return function PendingPart() {
    const t = useText();
    return (
      <Placeholder id={id}>
        <span>{t('core:part.pending')}</span>
      </Placeholder>
    );
  };
}
