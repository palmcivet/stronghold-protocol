import { useEffect, useState } from 'react';
import { useArt } from '../infra/resource/art.js';
import { useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import { Button, Cluster, Placeholder, Stack, Tabs } from '../ui/index.js';
import styles from './guide.module.css';

/** Official tutorial pages in reading order, by chapter. The page key names its picture (`guide/<key>`). */
export const GUIDE_CHAPTERS = [
  {
    id: 'home',
    pages: [
      'autochess_home_1',
      'autochess_home_2',
      'autochess_home_3',
      'autochess_home_4',
      'autochess_home_5',
      'autochess_home_6',
      'autochess_home_7',
      'autochess_home_8',
      'autochess_home_9',
    ],
  },
  {
    id: 'shop',
    pages: [
      'autochess_shop_1',
      'autochess_shop_2',
      'autochess_shop_3',
      'autochess_shop_4',
      'autochess_shop_5',
      'autochess_shop_6',
    ],
  },
  {
    id: 'handbook',
    pages: [
      'autochess_handbook_1',
      'autochess_handbook_2',
      'autochess_handbook_3',
      'autochess_handbook_4',
    ],
  },
] as const;

type ChapterId = (typeof GUIDE_CHAPTERS)[number]['id'];
type PageKey = (typeof GUIDE_CHAPTERS)[number]['pages'][number];

const PAGES: readonly { readonly key: PageKey; readonly chapter: ChapterId }[] =
  GUIDE_CHAPTERS.flatMap((chapter) =>
    chapter.pages.map((key: PageKey) => ({ key, chapter: chapter.id })),
  );

/** A tutorial page's picture (`image:ui/guide/<key>`), stretched back to 16:9; a note while it is missing. */
function GuideImage({ pageKey }: { readonly pageKey: PageKey }) {
  const t = useText();
  const src = useArt(`image:ui/guide/${pageKey}`);
  if (!src) {
    return (
      <Placeholder id={`guide/${pageKey}`}>
        {t('core:guide.artPending')}
      </Placeholder>
    );
  }
  return (
    <img
      className={cx(styles.image)}
      src={src}
      alt={t(`core:guide.page.${pageKey}`)}
    />
  );
}

/** The guide pager: chapter tabs, the page, previous / next, page dots; ← → (A / D) turn pages. */
export function GuidePager() {
  const t = useText();
  const [index, setIndex] = useState(0);
  const page = PAGES[index] ?? PAGES[0];
  const turn = (step: number): void =>
    setIndex((current) => (current + step + PAGES.length) % PAGES.length);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement) {
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'a') {
        turn(-1);
      } else if (event.key === 'ArrowRight' || event.key === 'd') {
        turn(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!page) {
    return null;
  }
  const chapterPages = PAGES.filter((entry) => entry.chapter === page.chapter);
  return (
    <Stack gap={3}>
      <Tabs
        label={t('core:guide.chapters')}
        selected={page.chapter}
        onSelect={(id) =>
          setIndex(PAGES.findIndex((entry) => entry.chapter === id))
        }
        items={GUIDE_CHAPTERS.map((chapter) => ({
          id: chapter.id,
          label: t(`core:guide.chapter.${chapter.id}`),
          content: null,
        }))}
      />
      <figure className={cx(styles.stage)} aria-live="polite">
        <GuideImage pageKey={page.key} />
        <figcaption className={cx(styles.caption)}>
          {t(`core:guide.page.${page.key}`)}
        </figcaption>
      </figure>
      <Cluster gap={2}>
        <Button onPress={() => turn(-1)}>{t('core:guide.previous')}</Button>
        <ol className={cx(styles.dots)} aria-label={t('core:guide.pages')}>
          {chapterPages.map((entry) => (
            <li key={entry.key}>
              <button
                type="button"
                className={cx(styles.dot)}
                aria-current={entry.key === page.key ? 'page' : undefined}
                aria-label={t(`core:guide.page.${entry.key}`)}
                onClick={() => setIndex(PAGES.indexOf(entry))}
              />
            </li>
          ))}
        </ol>
        <Button onPress={() => turn(1)}>{t('core:guide.next')}</Button>
        <span>
          {t('core:guide.position', { page: index + 1, total: PAGES.length })}
        </span>
      </Cluster>
    </Stack>
  );
}
