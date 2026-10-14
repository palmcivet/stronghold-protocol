import { DIALOG } from '#part/dialog.js';
import { definePart, Part } from '#part/registry.js';
import { GuidePager } from './pager.js';

/** The guide dialog. */
function GuideLayout() {
  return (
    <section data-part={DIALOG.guide}>
      <Part id="core:guide.pager" />
    </section>
  );
}

export function registerGuideParts(): readonly (() => void)[] {
  return [
    definePart(DIALOG.guide, GuideLayout, { extensible: true }),
    definePart('core:guide.pager', GuidePager, {
      extensible: true,
    }),
  ];
}
