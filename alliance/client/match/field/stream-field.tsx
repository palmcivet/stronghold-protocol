import type { StreamUnit } from '@alliance/compat-upstream';
import { useStream } from '#infra/store/hook.js';
import type { StreamLine } from '#infra/store/stream.js';
import { useText } from '#infra/text/index.js';
import { cx } from '#infra/theme/class-name.js';
import styles from './field.module.css';

/** Extra room around the units, in field units, so none sits on the edge. */
const MARGIN = 0.5;

interface Bounds {
  readonly x0: number;
  readonly y0: number;
  readonly width: number;
  readonly height: number;
}

function boundsOf(units: readonly StreamUnit[]): Bounds {
  const xs = units.map((unit) => unit.x);
  const ys = units.map((unit) => unit.y);
  const x0 = Math.min(...xs) - MARGIN;
  const y0 = Math.min(...ys) - MARGIN;
  return {
    x0,
    y0,
    width: Math.max(1, Math.max(...xs) + MARGIN - x0),
    height: Math.max(1, Math.max(...ys) + MARGIN - y0),
  };
}

/**
 * Stand-in stream field for unit tests: each unit where the latest snapshot puts it, with HP, fallen marks, and an
 * event log. Match screens use {@link StageField}.
 */
export function StreamField() {
  const t = useText();
  const { snapshot, info, events } = useStream((state) => ({
    snapshot: state.snapshot,
    info: state.info,
    events: state.events,
  }));
  if (!snapshot || snapshot.units.length === 0) {
    return null;
  }
  const nameOf = (id: string): string => info[id]?.name ?? id;
  const bounds = boundsOf(snapshot.units);
  const lineText = ({ event }: StreamLine): string => {
    if (event.kind === 'fx') {
      return t('core:stream.label');
    }
    if (event.kind === 'skill') {
      return t('core:stream.label');
    }
    const name = nameOf(event.unitId);
    return event.kind === 'damage' || event.kind === 'heal'
      ? t(`core:stream.${event.kind}`, { name, amount: event.amount })
      : t(`core:stream.${event.kind}`, { name });
  };
  return (
    <section aria-label={t('core:stream.label')} data-stream="">
      <ul className={cx(styles.stream)}>
        {snapshot.units.map((unit) => {
          const name = nameOf(unit.id);
          const side = info[unit.id]?.side ?? 'enemy';
          return (
            <li
              key={unit.id}
              data-unit={unit.id}
              data-side={side}
              data-alive={unit.alive}
              className={cx(
                styles.unit,
                side === 'ally' ? styles.ally : styles.enemy,
                unit.alive ? undefined : styles.fallen,
              )}
              style={{
                left: `${((unit.x - bounds.x0) / bounds.width) * 100}%`,
                top: `${((unit.y - bounds.y0) / bounds.height) * 100}%`,
              }}
            >
              <span className={cx(styles.unitName)}>{name}</span>
              <meter
                className={cx(styles.hp)}
                min={0}
                max={unit.maxHp}
                value={unit.hp}
                aria-label={
                  unit.alive
                    ? t('core:stream.unit', {
                        name,
                        hp: Math.round(unit.hp),
                        max: Math.round(unit.maxHp),
                      })
                    : t('core:stream.down', { name })
                }
              />
            </li>
          );
        })}
      </ul>
      <ol role="log" className={cx(styles.log)}>
        {events.map((line) => (
          <li key={line.seq} data-event={line.event.kind}>
            {lineText(line)}
          </li>
        ))}
      </ol>
    </section>
  );
}
