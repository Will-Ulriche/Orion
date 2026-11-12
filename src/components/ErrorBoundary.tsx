import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught exception:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#131218] text-slate-100 flex flex-col items-center justify-center p-6 select-text">
          <div className="max-w-xl w-full bg-[#1e1d27] rounded-3xl p-8 border border-white/10 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-5 text-rose-400">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Une anomalie d'affichage est survenue</h2>
            <p className="text-sm text-slate-400 mb-4">
              L'application a capturé une exception. Vous pouvez recharger l'interface ou copier le rapport ci-dessous.
            </p>
            <div className="bg-black/40 p-4 rounded-xl text-xs font-mono text-rose-300 overflow-auto max-h-48 mb-4 border border-rose-500/20">
              {this.state.error?.toString()}
            </div>
            {this.state.errorInfo?.componentStack && (
              <pre className="bg-black/30 p-3 rounded-lg text-[11px] font-mono text-slate-400 overflow-auto max-h-36 mb-5">
                {this.state.errorInfo.componentStack}
              </pre>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition cursor-pointer shadow-lg shadow-indigo-600/30"
              >
                Recharger la page
              </button>
              <button
                onClick={() => {
                  window.location.href = '/';
                }}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-medium rounded-xl transition cursor-pointer"
              >
                Retour à l'accueil
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
