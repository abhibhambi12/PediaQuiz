import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
            <h1 className="text-3xl font-bold text-red-500">Oops! Something Went Wrong.</h1>
            <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
                We've encountered an unexpected error. Please try refreshing the page.
            </p>
            <button
                onClick={() => window.location.reload()}
                className="mt-6 px-4 py-2 rounded-md font-semibold bg-sky-500 text-white hover:bg-sky-600"
            >
                Refresh Page
            </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;