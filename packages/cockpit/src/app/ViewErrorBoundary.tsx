import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { Button } from '../ui/components/Button.tsx';
import { EmptyState } from '../ui/components/EmptyState.tsx';
import { Page } from '../ui/layout/Page.tsx';
import { isChunkLoadError } from './chunk-load-error.ts';

interface ViewErrorBoundaryProps {
  readonly children: ReactNode;
  /** The error is cleared when this changes, so that moving to another view draws it. */
  readonly resetKey: string;
  /** Reloads the document; the page's own reload by default. */
  readonly reload?: (() => void) | undefined;
  /** Where a caught error is reported; the console by default. */
  readonly report?: ((error: Error, info: ErrorInfo) => void) | undefined;
}

interface ViewErrorBoundaryState {
  readonly error: Error | null;
}

const ICON_SIZE = 14;
const ALERT_ICON_SIZE = 16;

function reloadDocument(): void {
  window.location.reload();
}

function reportToConsole(error: Error, info: ErrorInfo): void {
  console.error(error, info.componentStack);
}

interface ViewErrorProps {
  readonly error: Error;
  readonly retry: () => void;
  readonly reload: () => void;
}

/** What replaces a view that could not be drawn: the message, and the way to try again. */
function ViewError({ error, retry, reload }: ViewErrorProps) {
  const { t } = useI18n();
  const staleBundle = isChunkLoadError(error);
  return (
    <Page width="narrow">
      <div role="alert">
        <EmptyState
          icon={<TriangleAlert size={ALERT_ICON_SIZE} />}
          title={t('view.error.title')}
          description={
            <>
              {staleBundle ? t('view.error.chunk') : t('view.error.render')}
              <span className="mono truncate" data-testid="view-error-detail">
                {error.message}
              </span>
            </>
          }
          action={
            <Button icon={<RefreshCw size={ICON_SIZE} />} onClick={staleBundle ? reload : retry}>
              {staleBundle ? t('view.error.reload') : t('view.error.retry')}
            </Button>
          }
        />
      </div>
    </Page>
  );
}

/**
 * Catches what a view throws while it renders, or the failure to load its chunk, instead of unmounting the whole tree.
 * A chunk that failed to load is not tried again by the browser, which caches the rejected import: it offers a reload.
 */
export class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  override state: ViewErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ViewErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    (this.props.report ?? reportToConsole)(error, info);
  }

  override componentDidUpdate(previous: ViewErrorBoundaryProps): void {
    if (this.state.error !== null && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return <ViewError error={error} retry={this.retry} reload={this.props.reload ?? reloadDocument} />;
  }
}
