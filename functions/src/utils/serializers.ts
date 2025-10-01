// FIX: Restored the Timestamp serialization helper.
import { Timestamp } from "firebase-admin/firestore";

export const convertDocTimestamps = (data: any): any => {
    if (!data) {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(item => convertDocTimestamps(item));
    }

    if (data instanceof Timestamp) {
        return data.toDate().toISOString();
    }
    
    if (typeof data === 'object' && Object.prototype.toString.call(data) === '[object Object]') {
        const serializedObject: { [key: string]: any } = {};
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                serializedObject[key] = convertDocTimestamps(data[key]);
            }
        }
        return serializedObject;
    }

    return data;
};