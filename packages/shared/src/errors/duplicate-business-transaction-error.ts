import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown when attempting to create a Business Transaction that
 * already exists.
 *
 * Lives in @parmana/shared (not @parmana/runtime, where it
 * originated) so both @parmana/runtime's service layer and
 * @parmana/storage's repository implementations can throw and
 * catch the identical class — required for G-1's fix (both the
 * in-memory and Supabase repositories must surface the same typed
 * error for a duplicate). @parmana/storage cannot depend on
 * @parmana/runtime (packages/runtime/tsconfig.json already
 * references ../storage for its own test fixtures, so the reverse
 * would be circular); @parmana/shared is the common package both
 * already depend on.
 *
 * packages/runtime/src/errors/DuplicateBusinessTransactionError.ts
 * re-exports this class unchanged, so every existing import path
 * (business-transaction-service.ts, error-handler.ts,
 * execute-api.test.ts) keeps working with no changes and no loss of
 * `instanceof` identity.
 */
export class DuplicateBusinessTransactionError extends ParmanaError {
  constructor(businessTransactionId: string) {
    super(
      "DUPLICATE_BUSINESS_TRANSACTION",
      `Business Transaction '${businessTransactionId}' already exists.`,
      409,
    );
  }
}
