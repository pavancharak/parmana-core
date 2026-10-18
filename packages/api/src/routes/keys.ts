import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { SignerBootstrap } from "@parmana/crypto";

/**
 * Public-key discovery (PQC audit RED-2, docs/VERIFICATION-GAPS.md).
 *
 * Deliberately mounted before this app's caller-auth middleware (see
 * app.ts), alongside /refusal/verify and /audit/verify -- a third
 * party cannot fetch the key it needs to independently verify a
 * signature from a route that itself requires a Parmana-issued
 * credential to reach. No database access; reads only the configured
 * PARMANA_KEY_DIR.
 *
 * Every response includes the key as a PEM-encoded SPKI public key
 * (RFC 7468, universally supported -- what
 * packages/crypto/src/OfflineVerifier.ts and its Python counterpart,
 * python/parmana/crypto/offline_verifier.py, both consume directly)
 * plus, when Node's own KeyObject.export({format:"jwk"}) supports the
 * key's algorithm, a `jwk` field alongside it. ML-DSA-65 exports as
 * kty "AKP" (the IETF JOSE/COSE-track key type for ML-DSA -- draft-
 * ietf-jose-fully-specified-algorithms -- not an identifier this
 * codebase invented), Ed25519 as the long-standardized kty "OKP".
 */
export function createKeysRouter(): Router {
  const router = Router();

  async function respondWithKey(
    keyId: string,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const keys = await SignerBootstrap.create();

      if (!(await keys.hasKey(keyId))) {
        res.status(404).json({ error: `Key not found: ${keyId}` });
        return;
      }

      const [metadata, publicKey] = await Promise.all([
        keys.getMetadata(keyId),
        keys.getPublicKey(keyId),
      ]);

      const pem = publicKey.export({ format: "pem", type: "spki" }).toString();

      let jwk: unknown;

      try {
        jwk = publicKey.export({ format: "jwk" });
      } catch {
        // Not every algorithm this codebase supports necessarily has
        // a JWK export in the running Node version -- omit rather
        // than fail the whole response over an optional convenience
        // field the PEM above already covers.
      }

      res.json({
        keyId: metadata.keyId,
        algorithm: metadata.algorithm,
        use: "sig",
        pem,
        ...(jwk !== undefined ? { jwk } : {}),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /keys/:keyId
   *
   * Mounted on this router directly (rather than relying on an
   * app.use("/keys", ...) prefix) so /.well-known/jwks.json below can
   * live at the conventional root path on the same router, in the
   * same app.use() call in app.ts.
   */
  router.get(
    "/keys/:keyId",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const keyId = req.params.keyId;

      if (typeof keyId !== "string") {
        res.status(400).json({ error: "keyId is required." });
        return;
      }

      await respondWithKey(keyId, res, next);
    },
  );

  /**
   * GET /.well-known/jwks.json
   *
   * Lists every key this deployment can currently produce a public
   * key for, keyed the same way GET /keys/:keyId responds for a
   * single one -- not a standards-pure RFC 7517 JWK Set (this
   * codebase's PEM-first shape does not fit that spec's "keys": [jwk,
   * ...] structure exactly, since not every entry necessarily has a
   * jwk field), but a superset any consumer that only wants `.jwk`
   * per entry can filter down to.
   */
  router.get(
    "/.well-known/jwks.json",
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const keys = await SignerBootstrap.create();

        if (!keys.listKeys) {
          res.status(501).json({
            error: "This KeyProvider does not support listing keys.",
          });
          return;
        }

        const keyIds = await keys.listKeys();

        const entries = await Promise.all(
          keyIds.map(async (keyId) => {
            const [metadata, publicKey] = await Promise.all([
              keys.getMetadata(keyId),
              keys.getPublicKey(keyId),
            ]);

            const pem = publicKey
              .export({ format: "pem", type: "spki" })
              .toString();

            let jwk: unknown;

            try {
              jwk = publicKey.export({ format: "jwk" });
            } catch {
              // See respondWithKey's identical comment above.
            }

            return {
              keyId: metadata.keyId,
              algorithm: metadata.algorithm,
              use: "sig",
              pem,
              ...(jwk !== undefined ? { jwk } : {}),
            };
          }),
        );

        res.json({ keys: entries });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
