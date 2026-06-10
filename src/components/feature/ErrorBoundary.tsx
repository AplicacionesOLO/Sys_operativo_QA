import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  moduleName?: string;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.moduleName ? ` - ${this.props.moduleName}` : ''}]`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const name = this.props.moduleName ?? 'este módulo';
      return (
        <div className="flex items-center justify-center py-32 px-4">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-rose-50">
              <i className="ri-error-warning-line text-3xl text-rose-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 mb-2">
                Error al renderizar {name}
              </h2>
              <p className="text-sm text-slate-500 mb-1">
                Ocurrió un error inesperado al mostrar {name}.
              </p>
              {this.state.error && (
                <p className="text-xs text-rose-500 bg-rose-50 rounded-lg px-3 py-2 mb-4 font-mono break-all">
                  {this.state.error.message}
                </p>
              )}
              <button
                onClick={this.handleRetry}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-refresh-line mr-1.5" />Reintentar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}