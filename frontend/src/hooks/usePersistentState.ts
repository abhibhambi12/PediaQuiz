// frontend/src/hooks/usePersistentState.ts
import { useState, useEffect, Dispatch, SetStateAction } from 'react';

/**
 * Custom hook for managing state that persists in localStorage.
 * It's generic to work with any serializable type.
 * @param key The key under which to store the value in localStorage.
 * @param defaultValue The default value to use if no value is found in localStorage.
 * @returns A tuple containing the state value and the state setter function.
 */
export function usePersistentState<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
    // Initialize state from localStorage or use default value
    const [state, setState] = useState<T>(() => {
        try {
            const savedValue = localStorage.getItem(key);
            // Parse stored JSON string or return default value
            return savedValue ? JSON.parse(savedValue) : defaultValue;
        } catch (error) {
            // Log error if localStorage parsing fails and return default value
            console.error(`Error parsing localStorage key "${key}":`, error);
            return defaultValue;
        }
    });

    // Effect to update localStorage whenever the state changes
    useEffect(() => {
        try {
            // Store the current state as a JSON string in localStorage
            localStorage.setItem(key, JSON.stringify(state));
        } catch (error) {
            // Log error if localStorage writing fails
            console.error(`Error setting localStorage key "${key}":`, error);
        }
    }, [key, state]); // Re-run effect if key or state changes

    // Return the state value and the state setter function
    return [state, setState];
}