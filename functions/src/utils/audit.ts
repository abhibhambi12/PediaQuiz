// FIX: Restored the audit logging helper function.
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { db } from "../firebaseAdmin";
import { LogEntry } from "@pediaquiz/types";

export const createAuditLog = async ({
    userId,
    message,
    context,
}: {
    userId: string;
    message: string;
    context?: Record<string, any>;
}): Promise<void> => {
    try {
        const logEntry: Omit<LogEntry, "id" | "timestamp"> & { timestamp: FieldValue } = {
            userId,
            message,
            context: context || {},
            type: "audit",
            timestamp: FieldValue.serverTimestamp(),
        };
        await db.collection("logs").add(logEntry);
    } catch (error) {
        logger.error("Failed to create audit log.", {
            userId,
            message,
            context,
            error,
        });
    }
};