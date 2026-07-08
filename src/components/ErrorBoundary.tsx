import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary: Caught an unhandled exception:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <div className="p-4 bg-card border border-border rounded-md text-foreground m-4 text-xs">
                    <h3 className="font-semibold text-destructive text-xs mb-1">System Exception</h3>
                    <p className="text-muted-foreground mb-3 leading-relaxed">
                        An unhandled rendering error was caught in the interface layer.
                    </p>
                    <pre className="p-2 bg-muted rounded font-mono text-[10px] overflow-auto max-h-32 text-foreground/90 border border-border mb-3">
                        {this.state.error?.toString() || 'Unknown Error'}
                    </pre>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="px-2 py-1.5 bg-primary text-primary-foreground rounded hover:opacity-90 font-medium text-xxs transition-opacity"
                    >
                        Reset Layout
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
