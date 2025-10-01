import React, { Component, ErrorInfo, ReactNode } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

const logClientError = httpsCallable<{ error: any; errorInfo: any }, { success: boolean }>(functions, 'logClientError');

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    
    // Log the error to the backend if not in development
    if (import.meta.env.PROD) {
        logClientError({ 
          error: { message: error.message, stack: error.stack }, 
          errorInfo: { componentStack: errorInfo.componentStack } 
        }).catch(e => console.error("Failed to log client error to backend:", e));
    }
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-slate-50 dark:bg-slate-900">
          <div className="card-base max-w-lg mx-auto p-8">
            <h1 className="text-2xl font-bold text-red-500">Oops! Something Went Wrong.</h1>
            <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
              We're sorry for the inconvenience. The error has been reported. Please try refreshing the page.
            </p>
            {import.meta.env.DEV && this.state.error && (
                <pre className="mt-4 text-xs text-left text-slate-500 bg-slate-100 dark:bg-slate-700 p-2 rounded overflow-x-auto">
                    {this.state.error.toString()}
                </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-6 btn-primary"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;