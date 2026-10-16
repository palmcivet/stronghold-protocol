import { Button, Notice } from '@alliance/ui';
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useLayoutEffect,
  useRef,
} from 'react';
import { registerPartMount } from '#infra/debug/mount.js';
import { useText } from '#infra/text/index.js';
import { BackToLobby } from './leave.js';
import { hasPart, Part } from './registry.js';

/** Part id of the error panel; a mod may replace it, the built-in one below stands in until it is defined. */
export const ERROR_PART = 'core:shell.error';

export interface PartBoundaryProps {
  /** Part id of what the boundary holds; a failure is reported under it. */
  readonly part: string;
  /** What shows instead of the part while it has failed. `retry` mounts the part again. */
  readonly fallback: (retry: () => void) => ReactNode;
  readonly onError?: (part: string, error: unknown) => void;
  readonly children: ReactNode;
}

interface PartBoundaryState {
  readonly failed: boolean;
  readonly attempt: number;
}

/** Holds a render failure of one part, so the parts around it keep working. */
export class PartBoundary extends Component<
  PartBoundaryProps,
  PartBoundaryState
> {
  override state: PartBoundaryState = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<PartBoundaryState> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    const { part, onError } = this.props;
    console.error(`[part] ${part} failed`, error, info.componentStack);
    onError?.(part, error);
  }

  private readonly retry = (): void => {
    this.setState((state) => ({ failed: false, attempt: state.attempt + 1 }));
  };

  override render(): ReactNode {
    const { part, fallback, children } = this.props;
    const { failed, attempt } = this.state;
    if (failed) {
      return (
        <div data-failed-part={part} role="alert">
          {fallback(this.retry)}
        </div>
      );
    }
    return <PartRemount key={attempt}>{children}</PartRemount>;
  }
}

function PartRemount({ children }: { readonly children: ReactNode }) {
  return children;
}

/**
 * Always-on `[data-part]` marker (display: contents) for debug highlight / queries.
 * Registers with infra/debug while mounted. Skipped when `boundary="none"`.
 */
function PartMark({
  part,
  children,
}: {
  readonly part: string;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => registerPartMount(part, ref.current), [part]);
  return (
    <div data-part={part} style={{ display: 'contents' }} ref={ref}>
      {children}
    </div>
  );
}

/** The error panel of a failed page or part. */
export function ErrorFallback({
  retry,
  scope,
}: {
  readonly retry: () => void;
  readonly scope: 'page' | 'part';
}) {
  if (hasPart(ERROR_PART)) {
    return <Part id={ERROR_PART} boundary="none" retry={retry} scope={scope} />;
  }
  return <DefaultError retry={retry} scope={scope} />;
}

/** The host's error panel: a retry, and on a page the way back to the lobby. */
export function DefaultError({
  retry,
  scope,
}: {
  readonly retry: () => void;
  readonly scope: 'page' | 'part';
}) {
  return scope === 'page' ? (
    <PageError retry={retry} />
  ) : (
    <PartError retry={retry} />
  );
}

function PageError({ retry }: { readonly retry: () => void }) {
  const t = useText();
  return (
    <Notice
      variant="error"
      announce={false}
      title={t('core:error.page')}
      actions={
        <>
          <Button variant="primary" onPress={retry}>
            {t('core:error.retry')}
          </Button>
          <BackToLobby />
        </>
      }
    >
      <p>{t('core:error.pageHint')}</p>
    </Notice>
  );
}

function PartError({ retry }: { readonly retry: () => void }) {
  const t = useText();
  return (
    <Notice
      variant="error"
      announce={false}
      title={t('core:error.part')}
      actions={<Button onPress={retry}>{t('core:error.retry')}</Button>}
    />
  );
}

/** A page's boundary: a failed page offers a retry and the way back to the lobby. */
export function PageBoundary({
  part,
  children,
}: {
  readonly part: string;
  readonly children: ReactNode;
}) {
  return (
    <PartBoundary
      part={part}
      fallback={(retry) => <ErrorFallback retry={retry} scope="page" />}
    >
      <PartMark part={part}>{children}</PartMark>
    </PartBoundary>
  );
}

/** A part's boundary inside a page: only the part is replaced while it has failed. */
export function PartSlot({
  part,
  children,
}: {
  readonly part: string;
  readonly children: ReactNode;
}) {
  return (
    <PartBoundary
      part={part}
      fallback={(retry) => <ErrorFallback retry={retry} scope="part" />}
    >
      <PartMark part={part}>{children}</PartMark>
    </PartBoundary>
  );
}
