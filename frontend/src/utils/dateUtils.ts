import { Timestamp } from "firebase/firestore";

/**
 * Safely converts various date-like values (ISO string, number, Date)
 * into a JavaScript Date object. This is crucial for handling data from the backend and
 * prevents runtime crashes from invalid date formats passed to date-fns or new Date().
 * @param value The value to convert.
 * @returns A valid Date object, or a fallback date (Jan 1, 1970) for invalid or null inputs.
 */
export const safeToDate = (value: any): Date => {
    if (!value) {
        return new Date('1970-01-01T00:00:00Z');
    }
    // This check is for client-side Timestamp objects, which should not exist with the new architecture,
    // but is kept for robustness during transitions.
    if (value instanceof Timestamp) {
        return value.toDate();
    }
    if (value instanceof Date) {
        return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
            return d;
        }
    }
    return new Date('1970-01-01T00:00:00Z'); 
};