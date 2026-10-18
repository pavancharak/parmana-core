/**
 * Re-exported from @parmana/shared so every existing import of
 * DuplicateBusinessTransactionError from @parmana/runtime (or this
 * relative path) keeps resolving to the exact same class — the one
 * @parmana/storage's repository implementations now also throw.
 * See packages/shared/src/errors/duplicate-business-transaction-error.ts
 * for why the concrete class lives there.
 */
export { DuplicateBusinessTransactionError } from "@parmana/shared";
