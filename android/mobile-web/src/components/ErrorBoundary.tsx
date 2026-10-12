import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full bg-[#07080c] text-white flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-base font-bold text-white mb-1">Ошибка загрузки</h2>
          <p className="text-xs text-neutral-400 mb-4 max-w-xs">
            Произошла ошибка при запуске интерфейса.
          </p>
          {this.state.error?.message && (
            <p className="text-[11px] font-mono text-neutral-400 bg-white/5 p-2 rounded-xl mb-4 max-w-xs truncate">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleReload}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent-color)] text-black font-bold text-xs uppercase tracking-wider"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Перезагрузить</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
