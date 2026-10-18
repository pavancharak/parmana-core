import crypto from "node:crypto";

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { handbookDownloadLeadRepository } from "../repositories.js";

// Linear time: each domain label excludes ".", so the engine never has
// two ways to split the same input (the old pattern did, which made it
// quadratic on long input). Same shape: local@label(.label)+.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const EMAIL_MAX_LENGTH = 254;

/**
 * Served by this API itself (see routes/handbook-pdf.ts), not the
 * docs site: PDF file serving on Mintlify requires an Enterprise
 * plan, confirmed the hard way when a redirect to a Mintlify-hosted
 * copy 404'd despite every other docs page working. This API is a
 * plain Vercel serverless Function with no such restriction. Still an
 * absolute URL, a different origin from where the download page
 * itself is served (the docs site), so a redirect target must be
 * absolute regardless of which origin actually hosts the file.
 */
const PDF_URL = "https://parmana-api-real.vercel.app/parmana-handbook.pdf";

async function captureLead(email: unknown): Promise<string | null> {
  if (
    typeof email !== "string" ||
    email.length > EMAIL_MAX_LENGTH ||
    !EMAIL_PATTERN.test(email.trim())
  ) {
    return null;
  }

  await handbookDownloadLeadRepository.create({
    handbookDownloadLeadId: crypto.randomUUID(),
    email: email.trim().toLowerCase(),
    capturedAt: new Date(),
  });

  return email.trim().toLowerCase();
}

/**
 * POST /handbook/download-leads and GET /handbook/download-leads
 *
 * Backs the email-gated PDF download at docs/site/handbook/download.mdx.
 * Deliberately mounted before this app's caller-auth middleware (see
 * app.ts) -- a visitor downloading the handbook has no Parmana
 * credential yet, that is the entire point of this route existing.
 * Records the email address, does not send a verification email --
 * see migration 20260916150000_add_handbook_download_leads.sql's own
 * comment for why that is a deliberate, not accidental, scope
 * boundary.
 *
 * Two verbs, same underlying capture, for two different callers:
 * GET (query param, ?email=...) backs a plain HTML <form method="get">
 * on the download page with no client-side JavaScript at all -- the
 * docs site host may sandbox or strip inline <script> tags, a plain
 * form submission has no such dependency, the browser navigates
 * directly and follows this route's 302 to the real file. POST (JSON
 * body) remains available for a programmatic caller that wants a
 * downloadUrl back in a response body instead of a redirect.
 */
export function createHandbookRouter(): Router {
  const router = Router();

  router.get(
    "/download-leads",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const captured = await captureLead(req.query.email);

        if (!captured) {
          res.status(400).send("A valid email address is required.");
          return;
        }

        res.redirect(302, PDF_URL);
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  router.post(
    "/download-leads",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const captured = await captureLead(req.body?.email);

        if (!captured) {
          res.status(400).json({
            error: "A valid email address is required.",
          });
          return;
        }

        res.status(201).json({
          downloadUrl: PDF_URL,
        });
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  return router;
}
