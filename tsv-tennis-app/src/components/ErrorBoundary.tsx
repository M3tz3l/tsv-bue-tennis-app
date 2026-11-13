import { Component, type ErrorInfo, type ReactNode } from 'react';
import { buttonVariants } from '../styles/tokens';

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** Catches render-time failures so a broken view does not blank the whole app. */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-2xl font-extrabold text-[var(--ink)]">Etwas ist schiefgelaufen</h1>
          <p className="text-sm text-[var(--body)]">Die Seite konnte nicht angezeigt werden. Bitte laden Sie sie neu.</p>
          <button type="button" className={buttonVariants.primary} onClick={() => window.location.reload()}>
            Neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
