// frontend/src/components/ErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from 'react';
// FIX: Import our new API caller utility instead of the raw firebase-functions import
import { createApiCaller } from '@/utils/apiClient';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

// FIX: Use the createApiCaller to route this call through the main 'api' function.
// This ensures the call goes to a valid endpoint with the correct CORS policy.
const logClientError = createApiCaller<
  { error: any; errorInfo: any },
  { success: boolean }
>('logClientError');


class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    if (import.meta.env.PROD) {
      // Now this call will correctly be routed through the /api endpoint
      logClientError({
        error: { message: error.message, stack: error.stack },
        errorInfo: { componentStack: errorInfo.componentStack },
      }).catch((e) => console.error('Failed to log client error to backend:', e));
    }
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 text-center bg-red-100 dark:bg-red-900/20">
          <div className="w-full max-w-2xl mx-auto p-8 bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-red-300 dark:border-red-700">
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">
              Oops! A Critical Error Occurred.
            </h1>
            <p className="mt-4 text-lg text-slate-700 dark:text-slate-300">
              We're sorry for the inconvenience. The error has been reported.
              Please try refreshing the page.
            </p>
            {this.state.error && (
              <pre className="mt-4 text-xs text-left text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 p-4 rounded overflow-x-auto whitespace-pre-wrap break-all">
                {this.state.error.stack || this.state.error.toString()}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-6 btn-primary !bg-red-600 hover:!bg-red-700 focus:!ring-red-500"
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