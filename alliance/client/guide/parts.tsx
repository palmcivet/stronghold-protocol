import { PAGE } from '../infra/router/page.js';
import { useText } from '../infra/text/index.js';
import { BackButton } from '../part/back.js';
import { definePart, Part } from '../part/registry.js';
import { Screen } from '../ui/index.js';
import { GuidePager } from './pager.js';

/** The guide page. Local; it returns where the player came from. */
function GuideLayout() {
  const t = useText();
  return (
    <section data-part={PAGE.guide}>
      <Screen title={t('core:nav.guide')} tools={<BackButton />}>
        <Part id="core:guide.pager" />
      </Screen>
    </section>
  );
}

export function registerGuideParts(): readonly (() => void)[] {
  return [
    definePart(PAGE.guide, GuideLayout, { extensible: true }),
    definePart('core:guide.pager', GuidePager, {
      extensible: true,
    }),
  ];
}
