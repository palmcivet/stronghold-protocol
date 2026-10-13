/** Part ids of the pages; each page is the part registered under its id. */
export const PAGE = {
  entry: 'core:screen.entry',
  profile: 'core:screen.profile',
  loadout: 'core:screen.loadout',
  guide: 'core:screen.guide',
  room: 'core:screen.room',
  match: 'core:screen.match',
} as const;

export type PageId = (typeof PAGE)[keyof typeof PAGE];
