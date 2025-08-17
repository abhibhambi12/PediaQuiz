import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  // Effect to automatically dismiss the toast after a delay
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(); // Call the onClose handler passed from the provider
    }, 3000); // Toast visible for 3 seconds

    // Cleanup function to clear the timeout if the component unmounts or dependencies change
    return () => clearTimeout(timer);
  }, [onClose]); // Re-run if onClose changes (though unlikely)

  // Determine background color based on toast type
  const bgColor =
    type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';

  return (
    // Fixed position toast in the bottom-right corner
    <div
      className={`fixed bottom-4 right-4 p-4 text-white rounded-lg shadow-lg ${bgColor} z-50`}
      role="alert" // ARIA role for alert messages
      aria-live="assertive" // Ensure screen readers announce changes
    >
      {message}
    </div>
  );
};

// ToastProvider component would typically manage an array of toasts and render them.
// This `Toast` component is likely rendered by such a provider.
export default Toast;