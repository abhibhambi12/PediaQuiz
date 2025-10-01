import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { ensureAuthenticated } from "./auth";
import { LIGHT_FUNCTION_OPTIONS } from "../config";

export const logClientError = onCall(LIGHT_FUNCTION_OPTIONS, (request) => {
    const userId = ensureAuthenticated(request);
    const { error, errorInfo } = request.data as { error: any; errorInfo: any };

    logger.error("Client-side error reported:", {
        userId,
        error: error,
        componentStack: errorInfo?.componentStack,
    });

    return { success: true, message: "Error logged successfully." };
});