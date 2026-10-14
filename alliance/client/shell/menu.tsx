import { useNavigate, useRouter } from '@tanstack/react-router';
import { useStore } from 'zustand';
import { menuItems, menuKey } from '#infra/router/menu.js';
import { presenceStore } from '#infra/store/presence.js';
import { sessionStore } from '#infra/store/session.js';
import { lookup, useText } from '#infra/text/index.js';
import { dialogStore, openDialog } from '#part/dialog.js';
import { matches } from '#part/slot.js';
import { ActionMenu } from '#ui/index.js';

/** Id of the menu entry part. Page layouts place it in their own regions; mods move, replace or add beside it. */
export const MENU_ENTRY = 'core:menu.entry';

/** The menu entry: the routes and dialogs whose definition carries `menu`, in order, filtered by their `when`. */
export function MenuEntry() {
  const t = useText();
  const router = useRouter();
  const navigate = useNavigate();
  // re-read the stores the `when` conditions look at
  useStore(presenceStore, (state) => state.presence);
  useStore(sessionStore, (state) => state.backend);
  const dialogs = useStore(dialogStore, (state) => state.dialogs);
  const items = menuItems(
    Object.values(router.routesById) as unknown as Parameters<
      typeof menuItems
    >[0],
    dialogs,
  ).filter((item) => matches(item.when));
  if (!items.length) {
    return null;
  }
  return (
    <ActionMenu
      label={t('core:menu.label')}
      items={items.map((item) => ({
        id: menuKey(item),
        label: lookup(item.label),
      }))}
      onAction={(key) => {
        const item = items.find((entry) => menuKey(entry) === key);
        if (item?.kind === 'dialog') {
          void openDialog(item.dialog);
        } else if (item) {
          void navigate({ to: item.path });
        }
      }}
    />
  );
}
