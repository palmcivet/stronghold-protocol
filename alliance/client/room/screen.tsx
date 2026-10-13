import { PAGE } from '../infra/router/page.js';
import { cx } from '../infra/theme/class-name.js';
import { RoomScreen } from '../room/room.js';
import styles from '../shell/shell.module.css';

export function RoomPage() {
  return (
    <section data-part={PAGE.room} className={cx(styles.page)}>
      <RoomScreen />
    </section>
  );
}
