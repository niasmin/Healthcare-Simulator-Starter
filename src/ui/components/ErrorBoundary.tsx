import { Component, type ReactNode } from 'react';
import { DICTS } from '../i18n';
import { useGame } from '../store';

/**
 * Instead of a blank screen when part of the page fails (most often a build file gone after a new
 * deploy), say so and offer a reload. The game itself is saved in the browser.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; onClose?: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    console.error(err);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const d = DICTS[useGame.getState().lang];
    return (
      <div className="fixed inset-0 z-[90] grid place-items-center bg-paper p-6 text-center" role="alert">
        <div className="max-w-sm flex flex-col gap-3">
          <div className="text-4xl">🔄</div>
          <h2 className="font-bold text-lg">{d['error.title']}</h2>
          <p className="text-sm text-ink-soft leading-relaxed">{d['error.body']}</p>
          <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-teal text-white font-bold px-4 py-2.5">
            {d['error.reload']}
          </button>
          {this.props.onClose && (
            <button type="button" onClick={() => (this.setState({ failed: false }), this.props.onClose?.())} className="text-sm underline text-ink-soft">
              {d['error.back']}
            </button>
          )}
        </div>
      </div>
    );
  }
}
