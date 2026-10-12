import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

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

  private handleReset = () => {
    try {
      sessionStorage.clear();
    } catch (e) {}
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090a0f] text-slate-100 flex flex-col items-center justify-center p-6 select-none font-sans">
          <div className="w-full max-w-md rounded-2xl bg-[#0f111a] border border-white/[0.08] p-6 shadow-2xl flex flex-col items-center text-center gap-4 animate-slide-up">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="flex flex-col gap-1">
              <h2 className="text-base font-bold text-white tracking-tight">
                Что-то пошло не так
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Произошла непредвиденная ошибка при отображении контента.
              </p>
              {this.state.error?.message && (
                <p className="mt-2 text-[11px] font-mono text-slate-500 bg-black/40 p-2 rounded-lg border border-white/[0.04] text-left truncate max-w-xs">
                  {this.state.error.message}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 w-full pt-2">
              <button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 text-xs font-semibold transition-all cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>На главную</span>
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold transition-all cursor-pointer shadow-md active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Перезагрузить</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
