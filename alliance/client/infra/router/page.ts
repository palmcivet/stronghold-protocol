/** Part ids of the pages. Step two registers the pages under these ids. */
export const PAGE = {
  entry: 'core:screen.entry',
  profile: 'core:screen.profile',
  room: 'core:screen.room',
  match: 'core:screen.match',
} as const;

export type PageId = (typeof PAGE)[keyof typeof PAGE];
