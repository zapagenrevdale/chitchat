import { ApiError } from "@google/genai";
import { APICallError, RetryError } from "ai";

/** Read only the status; provider error messages can contain credentials. */
export function providerErrorStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) {
    return error.status;
  }
  if (APICallError.isInstance(error)) {
    return error.statusCode;
  }
  if (RetryError.isInstance(error)) {
    return providerErrorStatus(error.lastError);
  }
}
