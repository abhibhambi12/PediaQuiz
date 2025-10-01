import { onCall } from "firebase-functions/v2/https";
import { db } from "./firebaseAdmin";
import { ensureAdmin } from "./utils/auth";
import { convertDocTimestamps } from "./utils/serializers";
import { LIGHT_FUNCTION_OPTIONS } from "./config";
import { LogEntry } from "@pediaquiz/types";

export const getAuditLogs = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    await ensureAdmin(request);

    const { limit = 25, startAfter } = request.data as { limit?: number, startAfter?: string };

    let query = db.collection('logs')
        .orderBy('timestamp', 'desc')
        .limit(limit);

    if (startAfter) {
        const lastVisibleDoc = await db.collection('logs').doc(startAfter).get();
        if (lastVisibleDoc.exists) {
            query = query.startAfter(lastVisibleDoc);
        }
    }

    const snap = await query.get();
    const logs = snap.docs.map(doc => convertDocTimestamps({ id: doc.id, ...doc.data() })) as LogEntry[];
    const lastVisible = snap.docs[snap.docs.length - 1]?.id || null;

    return {
        logs,
        lastVisible,
    };
});