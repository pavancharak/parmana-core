import type { NextFunction, Request, Response } from "express";

import { renderErrorPage } from "../views/errorPage.js";

/**
 * Last-resort handler for anything the routes didn't already turn
 * into a rendered page (ApiClientError/ApiUnreachableError are always
 * handled inline, at the point they're thrown -- this is only for a
 * genuinely unexpected failure). Logs the real error server-side,
 * never renders its message or stack to the page.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (isCsrfRejection(error)) {
    res
      .status(403)
      .send(
        renderErrorPage(
          "This form is out of date. Reload the page and try again.",
        ),
      );
    return;
  }

  console.error({
    event: "governance_ui_unhandled_error",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  res
    .status(500)
    .send(renderErrorPage("Something went wrong. Please try again."));
}

/** csrf-csrf refuses a request with a missing or mismatched token by name. */
function isCsrfRejection(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { code?: unknown }).code === "EBADCSRFTOKEN"
  );
}
