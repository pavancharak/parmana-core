import { Router } from "express";

/**
 * Read-only, single-page API reference for third parties who want the
 * complete spec at a glance (auditors, regulators, integration partners)
 * without an interactive "Try it out" surface -- that's GET
 * /documentation. Renders ReDoc against this same server's own
 * GET /openapi.yaml, so it is never out of sync with what /documentation
 * or the SDKs describe: one spec, three views.
 */
const router = Router();

router.get("/", (_req, res) => {
  res.set({
    "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });

  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Parmana API Reference</title>
    <style>
      body {
        margin: 0;
        padding: 0;
      }
    </style>
  </head>
  <body>
    <redoc spec-url="/openapi.yaml"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>
`);
});

export default router;
