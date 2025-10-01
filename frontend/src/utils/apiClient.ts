import { httpsCallable, HttpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';

// Create a custom event for forced logout
const forceLogoutEvent = new Event('force-logout');

/**
 * A wrapper around httpsCallable that includes global error handling for authentication.
 * If an 'unauthenticated' or 'permission-denied' error is caught, it dispatches
 * a global event that the AuthContext can listen for to force a logout.
 *
 * @param functionName The name of the Cloud Function to call.
 * @returns An HttpsCallable function with built-in auth error handling.
 */
export function createApiCaller<TRequest, TResponse>(functionName: string): HttpsCallable<TRequest, TResponse> {
  const callable = httpsCallable<TRequest, TResponse>(functions, functionName);

  return (async (data: TRequest) => {
    try {
      return await callable(data);
    } catch (error) {
      const functionsError = error as { code?: string };
      if (
        functionsError.code === 'unauthenticated' ||
        functionsError.code === 'permission-denied'
      ) {
        console.error(`Auth error calling ${functionName}. Forcing logout.`);
        // Dispatch the global event for the AuthContext to catch
        window.dispatchEvent(forceLogoutEvent);
      }
      // Re-throw the error so the calling code can handle it (e.g., show a toast)
      throw error;
    }
  }) as HttpsCallable<TRequest, TResponse>;
}