import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { User } from "@pediaquiz/types";

export const ensureAuthenticated = (request: CallableRequest): string => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in to call this function.');
    }
    return request.auth.uid;
};

export const ensureRole = (request: CallableRequest, allowedRoles: User['role'][]): string => {
    const userId = ensureAuthenticated(request);
    const userRole = request.auth?.token?.role as User['role'] | undefined;
    if (!userRole || !allowedRoles.includes(userRole)) {
        throw new HttpsError("permission-denied", "You do not have the necessary permissions to perform this action.");
    }
    return userId;
};

export const ensureAdmin = (request: CallableRequest): string => {
    const userId = ensureAuthenticated(request);
    if (request.auth?.token?.role !== 'admin') {
        throw new HttpsError("permission-denied", "This function requires administrative privileges.");
    }
    return userId;
};