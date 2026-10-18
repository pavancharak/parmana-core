import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import type { ExecutionTrustApplication } from "@parmana/runtime";
import { isOwnedByCaller } from "../auth/isOwnedByCaller.js";
import { parsePagination } from "./pagination.js";

interface TrustRecordParams {
  businessTransactionId: string;
}

export function createTrustRecordsRouter(
  application: ExecutionTrustApplication,
): Router {
  const router = Router();

  /**
   * GET /trust-records
   *
   * Bulk export of Execution Trust Records — the periodic full-export
   * capability for external audit/compliance review that GET
   * /trust-records/:businessTransactionId (single-record lookup) and
   * GET /receipt/latest (per-transaction) don't cover on their own.
   * Returns the complete signed record (transaction, executions,
   * verifications, receipts, authorization) for every transaction on
   * the requested page, not just the raw Business Transaction GET
   * /transactions returns.
   *
   * Scoping and pagination deliberately mirror GET /transactions
   * exactly (page/pageSize query params, same post-fetch
   * submittedBy filter, same "never over-discloses, may under-fill a
   * page" trade-off) -- see that route's own comment for why. since/
   * until (ISO 8601) additionally filter by transaction.createdAt,
   * applied after the ownership filter, for a bounded date-range
   * export rather than requiring a caller to page through their
   * entire history.
   */
  router.get(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const pagination = parsePagination(req.query);

        if (!pagination.ok) {
          res.status(400).json({ error: pagination.error });
          return;
        }

        const records = await application.listTrustRecords(
          pagination.page,
          pagination.pageSize,
        );

        const scoped =
          req.callerId === undefined
            ? records
            : records.filter(
                (record) =>
                  record.transaction.metadata?.submittedBy === req.callerId,
              );

        const since =
          typeof req.query.since === "string"
            ? Date.parse(req.query.since)
            : undefined;
        const until =
          typeof req.query.until === "string"
            ? Date.parse(req.query.until)
            : undefined;

        const filtered = scoped.filter((record) => {
          // Declared as Date on BusinessTransaction, but a durable-
          // storage round trip (Supabase's JSONB column) can hand back
          // a plain ISO string despite the compile-time type — new
          // Date(...) accepts either.
          const createdAt = new Date(record.transaction.createdAt).getTime();

          if (since !== undefined && !Number.isNaN(since) && createdAt < since)
            return false;
          if (until !== undefined && !Number.isNaN(until) && createdAt > until)
            return false;

          return true;
        });

        res.json(filtered);
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * GET /trust-records/:businessTransactionId
   *
   * Returns the Execution Trust Record for a Business Transaction.
   */
  router.get(
    "/:businessTransactionId",
    async (
      req: Request<TrustRecordParams>,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        if (
          req.callerId !== undefined &&
          !(await isOwnedByCaller(
            application,
            req.params.businessTransactionId,
            req.callerId,
          ))
        ) {
          res.status(404).json({
            error: "Execution Trust Record not found.",
          });
          return;
        }

        const record = await application.getTrustRecord(
          req.params.businessTransactionId,
        );

        if (!record) {
          res.status(404).json({
            error: "Execution Trust Record not found.",
          });
          return;
        }

        res.json(record);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
