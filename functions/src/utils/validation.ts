import { z } from "zod";
import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

export function validateRequest<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
    const result = schema.safeParse(data);
    if (!result.success) {
        logger.error("Request validation failed", { errors: result.error.issues });
        throw new HttpsError("invalid-argument", "The data provided is not valid.", result.error.format());
    }
    return result.data;
}

export const updateUserProfileSchema = z.object({
    updates: z.object({
        displayName: z.string().optional(),
        theme: z.string().optional(),
        notificationSettings: z.record(z.boolean()).optional(),
        role: z.undefined(), 
        isAdmin: z.undefined(),
    }).passthrough()
});

export const updateEmailSchema = z.object({
    newEmail: z.string().email(),
});

export const updatePasswordSchema = z.object({
    newPassword: z.string().min(6),
});

export const deleteUserAccountSchema = z.object({});