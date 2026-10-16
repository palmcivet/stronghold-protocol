import { type ReactNode, useId } from 'react';
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import { cx } from '#ui/base/class-name.js';
import type { ControlSize } from '#ui/base/tone.js';
import { useFeedback } from '#ui/components/feedback/feedback.js';
import { Icon, type IconName } from '#ui/components/icon/icon.js';
import styles from './segmented.module.css';

export interface SegmentedOption {
  readonly value: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly disabled?: boolean;
  /** What a `cards` option shows instead of its label. */
  readonly content?: ReactNode;
}

export interface SegmentedProps {
  /** Names the group for assistive technology, and is shown above it unless `labelHidden`. */
  readonly label: string;
  readonly options: readonly SegmentedOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** `strip` is a joined row of segments; `cards` is a grid of framed cards with a check mark. */
  readonly variant?: 'strip' | 'cards';
  readonly size?: ControlSize;
  /** Keeps the label for assistive technology and drops it from the screen. */
  readonly labelHidden?: boolean;
  /** Direction of the `cards`; they share the row evenly when horizontal. */
  readonly orientation?: 'horizontal' | 'vertical';
  /** Cards per row of horizontal `cards`. */
  readonly columns?: number;
  readonly isDisabled?: boolean;
}

/**
 * One choice out of a few, all in view. The arrow keys move the focus and a press chooses,
 * so passing over an option with a keyboard or a gamepad never changes the choice.
 */
export function Segmented({
  label,
  options,
  value,
  onChange,
  variant = 'strip',
  size = 'md',
  labelHidden = false,
  orientation = 'horizontal',
  columns,
  isDisabled,
}: SegmentedProps) {
  const play = useFeedback();
  const labelId = useId();
  const cards = variant === 'cards';
  return (
    <div className={cx(styles.segmented)} data-size={size} data-tone="accent">
      <span
        id={labelId}
        className={cx(labelHidden ? 'wsde-visually-hidden' : styles.label)}
      >
        {label}
      </span>
      <ToggleButtonGroup
        aria-labelledby={labelId}
        className={cx(cards ? styles.cards : styles.strip)}
        orientation={orientation}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[value]}
        onSelectionChange={(keys) => {
          const [first] = keys;
          if (first !== undefined && String(first) !== value) {
            play('ui.tab');
            onChange(String(first));
          }
        }}
        {...(cards && columns !== undefined
          ? {
              style: {
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gridAutoFlow: 'row',
              },
            }
          : {})}
        {...(isDisabled === undefined ? {} : { isDisabled })}
      >
        {options.map((option) => (
          <ToggleButton
            key={option.value}
            id={option.value}
            isDisabled={option.disabled ?? false}
            className={cx(
              cards ? styles.card : styles.segment,
              cards && 'wsde-brackets',
            )}
            {...(cards && option.content !== undefined
              ? { 'aria-label': option.label }
              : {})}
          >
            {cards ? (
              <>
                {option.icon ? <Icon name={option.icon} /> : null}
                {option.content ?? option.label}
                <span className={cx(styles.check)} aria-hidden="true">
                  <Icon name="check" />
                </span>
              </>
            ) : (
              <>
                {option.icon ? <Icon name={option.icon} /> : null}
                {option.label}
              </>
            )}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}
