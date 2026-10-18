/**
 * Postgres SQLSTATE error codes surfaced verbatim by PostgREST (and
 * therefore by @supabase/supabase-js's `{ error }` results) in the
 * error object's `code` field.
 *
 * No such mapping existed anywhere in this codebase before this file
 * (see docs/VERIFICATION-GAPS.md D-1: the Supabase repositories rethrow
 * every insert error unmapped). Built here because
 * SupabaseNonceStore's atomic-consumption guarantee requires
 * distinguishing "this nonce already exists" from every other failure
 * mode, which are handled oppositely (reject vs. fail closed).
 */
export const POSTGRES_UNIQUE_VIOLATION = "23505";

/**
 * True if `error` is a Postgres/PostgREST unique-constraint violation
 * (SQLSTATE 23505) — the "two concurrent inserts of the same key"
 * case, not a connectivity or configuration failure.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}
