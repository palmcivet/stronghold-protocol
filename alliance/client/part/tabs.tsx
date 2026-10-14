import { lookup, useText } from '#infra/text/index.js';
import { Tabs } from '#ui/index.js';
import { partTitle } from './registry.js';
import { type PartInsert, SlotChild, useSlotParts } from './slot.js';

/** A container whose children are tabs; each tab's label is its part's title. */
export function PartTabs({
  id,
  label,
  defaults,
  orientation,
}: {
  readonly id: string;
  readonly label: string;
  readonly defaults?: readonly PartInsert[];
  readonly orientation?: 'horizontal' | 'vertical';
}) {
  useText();
  const parts = useSlotParts(id, defaults);
  return (
    <div data-slot={id}>
      <Tabs
        label={label}
        {...(orientation ? { orientation } : {})}
        items={parts.map((part) => {
          const title = partTitle(part.id);
          return {
            id: part.id,
            label: title ? lookup(title) : part.id,
            content: <SlotChild part={part} />,
          };
        })}
      />
    </div>
  );
}
