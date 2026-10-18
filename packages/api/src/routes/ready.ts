import { Router } from "express";

import { isPostgresStorage } from "@parmana/shared";
import { PostgresPoolFactory } from "@parmana/storage";

import { executionIntentsEnforced } from "../bootstrap/createExecutionIntents.js";

/**
 * GET /ready
 *
 * Readiness probe, distinct from /health's pure liveness check: this
 * one actually touches Postgres with one cheap query (`SELECT 1`,
 * transferring no table rows, just confirming the connection and
 * credentials work) so a PaaS orchestrator can tell a process that is
 * up but backed by dead storage apart from one that is genuinely
 * ready to serve traffic — and route around it accordingly.
 *
 * When storage is not Postgres backed (NODE_ENV=test, or
 * PARMANA_STORAGE=memory outside test), there is no external
 * dependency to probe, so this reports ready unconditionally — the
 * same distinction assertStorageConfigured.ts already draws at boot.
 *
 * Queries via a direct Postgres connection (PostgresPoolFactory), not
 * supabase-js/PostgREST — this probe previously depended on
 * PostgREST for a `consumed_nonces` HEAD request, which meant a
 * PostgREST-layer outage (the exact incident class this migration
 * removes) could make the readiness probe itself unreliable.
 */
export interface CreateReadyRouterOptions {
  /**
   * True when this process was started with PARMANA_AUTH_DISABLED=true
   * (see createCallerAuthenticator.ts). Surfaced here, not just as a
   * startup console.warn, because a log line is easy to miss in a
   * log-aggregation tool after the fact -- a field on the readiness
   * probe every PaaS orchestrator already polls every 30s is something
   * an operator's own monitoring/synthetic checks can assert on and
   * alert on directly, catching a "copied .env.example without reading
   * every line" misconfiguration before it becomes an incident rather
   * than after.
   */
  readonly authDisabled: boolean;
}

export function createReadyRouter(options: CreateReadyRouterOptions): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const authWarning = options.authDisabled
      ? {
          authDisabled: true,
          warning:
            "PARMANA_AUTH_DISABLED=true -- this deployment is accepting requests with no " +
            "caller authentication. Must never be set in a real deployment.",
        }
      : { authDisabled: false };

    if (
      process.env.NODE_ENV === "test" ||
      !isPostgresStorage(process.env.PARMANA_STORAGE)
    ) {
      res.json({
        status: "READY",
        storage: "not-supabase-backed",
        ...authWarning,
      });
      return;
    }

    try {
      const pool = PostgresPoolFactory.create();
      await pool.query("SELECT 1");

      //
      // ADR-0012: when Execution Intents are enforced, every execution needs
      // the execution_intents table. Without it the runtime refuses every
      // action with 503 EXECUTION_INTENT_UNAVAILABLE. Report that here, so a
      // deployment that skipped the migration is caught at the readiness check
      // and not on the first real request.
      //
      if (executionIntentsEnforced()) {
        const { rows } = await pool.query(
          "SELECT to_regclass('public.execution_intents') AS execution_intents",
        );

        if (rows[0]?.execution_intents == null) {
          res.status(503).json({
            status: "NOT_READY",
            reason:
              "The execution_intents table does not exist, so every execution would be refused with " +
              "EXECUTION_INTENT_UNAVAILABLE. Apply supabase/migrations/20260921120000_add_execution_intents.sql " +
              "to this database, then check GET /ready again.",
            ...authWarning,
          });
          return;
        }
      }

      res.json({ status: "READY", ...authWarning });
    } catch (error) {
      // The detail goes to the server log only. This route is public, and a
      // database error message can name hosts, roles and schema.
      console.error({
        event: "ready_check_failed",
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(503).json({
        status: "NOT_READY",
        reason: "storage unavailable",
        ...authWarning,
      });
    }
  });

  return router;
}
