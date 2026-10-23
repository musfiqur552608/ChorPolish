import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';
import { Logo } from './Logo';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Chor Police crashed', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-5 py-12">
        <div className="paper relative w-full max-w-md rounded-sm p-7 text-center">
          <div className="tape -top-3 left-8 rotate-[-4deg]" aria-hidden />
          <Logo className="justify-center" />
          <div className="my-6 squiggle-divider" />
          <p className="font-display text-2xl font-bold">খাতাটা ছিঁড়ে গেছে</p>
          <p className="mt-1 font-hand text-xl text-ink-soft">The notebook tore.</p>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            Something unexpected happened. Your game is safe on the server; reload and we’ll fold the page
            again.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => window.location.reload()} fullWidth>
              Reload the page
            </Button>
            <Button variant="secondary" onClick={() => { window.location.href = '/'; }} fullWidth>
              Back to the start
            </Button>
          </div>
          {this.state.message && (
            <p className="mt-5 break-words font-mono text-[10px] leading-relaxed text-ink-faint">
              {this.state.message}
            </p>
          )}
        </div>
      </main>
    );
  }
}
