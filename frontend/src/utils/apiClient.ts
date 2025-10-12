import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { functions } from '@/firebase';

// --- BATCH 1: CORE ARCHITECTURE REFACTORING ---
// This new file serves as the cornerstone of the API architecture. It ensures all
// backend communication is standardized, secure, and resilient by routing all
// calls through the existing 'api' gateway function in the backend.

/**
 * A custom event dispatched globally when an API call fails due to an
 * authentication issue ('unauthenticated' or 'permission-denied').
 * The AuthContext will listen for this event to trigger a forced logout.
 */
const forceLogoutEvent = new Event('force-logout');

/**
 * A single, memoized instance of the 'api' gateway Cloud Function.
 */
const api = httpsCallable(functions, 'api');

/**
 * Creates a type-safe, wrapped HttpsCallable function that routes all requests
 * through the single 'api' gateway. It automatically handles the routing by passing
 * the original function name as a 'task' parameter and includes global error handling.
 *
 * @param functionName The name of the specific 'task' to be executed on the backend.
 * @returns An async function that behaves like a standard HttpsCallable, but with
 *          built-in routing and robust authentication error handling.
 */
export function createApiCaller<TRequest, TResponse>(functionName: string): (data: TRequest) => Promise<HttpsCallableResult<TResponse>> {
  
  return async (data: TRequest): Promise<HttpsCallableResult<TResponse>> => {
    try {
      // The request payload is wrapped, passing the target function's name as 'task'
      // and the original data payload as 'data'.
      const response = await api({ task: functionName, data });
      return response as HttpsCallableResult<TResponse>;
    } catch (error) {
      // --- BATCH 1: GLOBAL AUTH ERROR HANDLING ---
      // This catch block intercepts all API errors globally.
      console.error(`[API Client Error] Task "${functionName}" failed:`, error);
      
      const functionsError = error as { code?: string };

      // If the error is due to authentication or permissions, dispatch the event.
      if (
        functionsError.code === 'unauthenticated' ||
        functionsError.code === 'permission-denied'
      ) {
        console.error(`Authentication error detected on task "${functionName}". Forcing logout.`);
        // Dispatch the global event for AuthContext to catch and handle the logout.
        window.dispatchEvent(forceLogoutEvent);
      }
      
      // Re-throw the error so that the original calling code (e.g., a React Query mutation)
      // can still handle its own specific error logic, like showing a toast notification.
      throw error;
    }
  };
}