// frontend/src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useToast } from './Toast';

interface OriginalErrorBoundaryProps {
  children: ReactNode;
  // Ensure addToast function type is correctly defined based on useToast return
  addToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning', duration?: number) => void;
}

interface OriginalErrorBoundaryState {
  hasError: boolean;
}

class OriginalErrorBoundary extends Component<OriginalErrorBoundaryProps, OriginalErrorBoundaryState> {
  state: OriginalErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(_: Error): OriginalErrorBoundaryState {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can also log the error to an error reporting service
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    // Use the addToast prop to show a user-friendly message
    this.props.addToast(`An unexpected error occurred: ${error.message}`, 'error');
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="p-4 text-red-600 dark:text-red-400 text-center flex flex-col items-center justify-center min-h-[300px]">
          <h2 className="text-2xl font-bold mb-2">Oops! Something went wrong.</h2>
          <p className="text-lg text-slate-700 dark:text-slate-300">
            We're sorry for the inconvenience. Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 btn-primary"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const ErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Access the addToast function from the context
  const { addToast } = useToast();
  // Pass addToast as a prop to the class component
  return <OriginalErrorBoundary addToast={addToast}>{children}</OriginalErrorBoundary>;
};

export default ErrorBoundary;