import { useState, useEffect, Dispatch, SetStateAction } from 'react';

/**
 * Custom hook for managing state that persists in localStorage.
 * Handles JSON serialization and parsing with error handling.
 * @param key The key for localStorage.
 * @param defaultValue The initial value if nothing is in localStorage.
 * @returns A state value and a function to update it, same as useState.
 */
export function usePersistentState<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
    const [state, setState] = useState<T>(() => {
        try {
            const savedValue = localStorage.getItem(key);
            return savedValue ? JSON.parse(savedValue) : defaultValue;
        } catch (error) {
            console.error(`Error parsing localStorage key "${key}":`, error);
            return defaultValue;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (error) {
            console.error(`Error setting localStorage key "${key}":`, error);
        }
    }, [key, state]);

    return [state, setState];
}