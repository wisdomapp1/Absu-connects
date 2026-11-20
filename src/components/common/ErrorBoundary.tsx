import React, { Component, ErrorInfo, ReactNode } from 'react';
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
    console.error('[ABSU Connect ErrorBoundary caught an unhandled error]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center select-none font-sans">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-5 text-amber-400">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <h1 className="text-xl font-bold tracking-tight text-white mb-2">
            Something went wrong
          </h1>

          <p className="text-sm text-slate-400 max-w-sm mb-6 leading-relaxed">
            ABSU Connect encountered an unexpected issue while loading this page. You can reload or try again.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs">
            <button
              onClick={this.handleReload}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-[0.98] transition font-semibold text-sm shadow-lg shadow-purple-600/20"
            >
              <RefreshCw className="w-4 h-4" />
              Reload App
            </button>

            <button
              onClick={this.handleReset}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-[0.98] transition font-semibold text-sm text-slate-300"
            >
              <Home className="w-4 h-4" />
              Try Again
            </button>
          </div>

          {this.state.error && (
            <div className="mt-8 text-left max-w-md w-full bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-400 overflow-x-auto">
              <span className="text-amber-400 font-semibold block mb-1">Details:</span>
              {this.state.error.message || String(this.state.error)}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
