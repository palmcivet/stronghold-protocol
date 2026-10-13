import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useText } from '../infra/text/index.js';
import { Button, Panel } from '../ui/index.js';
import { BackToLobby } from './leave.js';

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

function PageError({ retry }: { readonly retry: () => void }) {
  const t = useText();
  return (
    <Panel title={t('core:error.page')}>
      <p>{t('core:error.pageHint')}</p>
      <Button variant="primary" onPress={retry}>
        {t('core:error.retry')}
      </Button>
      <BackToLobby />
    </Panel>
  );
}

function PartError({ retry }: { readonly retry: () => void }) {
  const t = useText();
  return (
    <p>
      {t('core:error.part')}{' '}
      <Button onPress={retry}>{t('core:error.retry')}</Button>
    </p>
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
    <PartBoundary part={part} fallback={(retry) => <PageError retry={retry} />}>
      {children}
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
    <PartBoundary part={part} fallback={(retry) => <PartError retry={retry} />}>
      {children}
    </PartBoundary>
  );
}
