/**
 * Example 07: an external connector endpoint (ADR-0013).
 *
 * The HTTPS endpoint an operator registers for a capability, for example
 * `erp:create-invoice`. Parmana POSTs each approved request here as a
 * signed release. The endpoint checks it with verifyParmanaRelease, acts
 * in its own system with its own credentials, and answers with the
 * result. A release Parmana sends again after a timeout is answered with
 * the first result, never acted on twice.
 *
 * Run it:
 *
 *   PARMANA_PUBLIC_KEY_PEM="$(cat parmana-default.pem)" \
 *   ENDPOINT_URL=https://erp.example.com/parmana/release \
 *   PORT=8080 npx tsx examples/07-external-connector-endpoint.ts
 *
 * PARMANA_PUBLIC_KEY_PEM is the key from `client.publicKey("default")`.
 * ENDPOINT_URL is this endpoint's URL exactly as Parmana stored it at
 * registration (GET /external-connectors). Serve it over HTTPS: put it
 * behind your TLS terminating proxy, since Parmana releases only to
 * https.
 */

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import {
  verifyParmanaRelease,
  type ParmanaRelease,
  type ParmanaReleaseCondition,
} from "@parmana/sdk";

/**
 * What the endpoint answers: status and JSON body.
 */
export interface EndpointAnswer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export interface ReleaseHandlerOptions {
  /**
   * Key id to PEM, usually `{ default: pem }`.
   */
  readonly publicKeys: Readonly<Record<string, string>>;

  /**
   * This endpoint's URL as registered.
   */
  readonly audience: string;

  /**
   * Performs the action in your system, using only capability, target
   * and parameters from the verified release, and returns its result.
   */
  readonly act: (release: ParmanaRelease) => Promise<Record<string, unknown>>;

  /**
   * Where first answers are kept, by businessTransactionId. The default
   * lives in memory for this example; use your database, so a restart
   * cannot make the endpoint act twice.
   */
  readonly answers?: Map<string, Record<string, unknown>>;

  /**
   * RFC-0023 phase 4: whether every business fact the release rests on
   * still holds in your records. Called only when the release carries
   * conditions. Check them in the same transaction as the action, so
   * nothing can change in between; when one no longer holds, the
   * endpoint does not act and answers conditionsNotMet.
   */
  readonly conditionsHold?: (
    conditions: readonly ParmanaReleaseCondition[],
    release: ParmanaRelease,
  ) => Promise<boolean>;

  readonly now?: () => Date;
}

/**
 * The whole endpoint, independent of any HTTP framework: give it the
 * parsed JSON body, send back what it returns.
 */
export function createReleaseHandler(options: ReleaseHandlerOptions) {
  const answers = options.answers ?? new Map<string, Record<string, unknown>>();

  return async (body: unknown): Promise<EndpointAnswer> => {
    const verification = await verifyParmanaRelease(body, {
      publicKeys: options.publicKeys,
      audience: options.audience,
      isAlreadyExecuted: (id) => answers.has(id),
      ...(options.now !== undefined ? { now: options.now() } : {}),
    });

    if (!verification.valid) {
      // Parmana records anything but 200 as an unknown outcome; nothing
      // was done here, and the errors say why.
      return { status: 401, body: { errors: verification.errors } };
    }

    const { release } = verification;

    const first = answers.get(release.businessTransactionId);

    if (verification.alreadyExecuted && first !== undefined) {
      return { status: 200, body: first };
    }

    if (
      release.conditions !== undefined &&
      release.conditions.length > 0 &&
      options.conditionsHold !== undefined &&
      !(await options.conditionsHold(release.conditions, release))
    ) {
      // Not acted on. Kept as the first answer, so a repeat of this
      // release gets the same one.
      const declined = {
        businessTransactionId: release.businessTransactionId,
        capability: release.capability,
        success: false,
        conditionsNotMet: true,
        result: { reason: "A condition the release rests on no longer holds." },
      };

      answers.set(release.businessTransactionId, declined);

      return { status: 200, body: declined };
    }

    const result = await options.act(release);
    const answer = {
      businessTransactionId: release.businessTransactionId,
      capability: release.capability,
      success: true,
      result,
      executedAt: new Date().toISOString(),
    };

    answers.set(release.businessTransactionId, answer);

    return { status: 200, body: answer };
  };
}

/**
 * The action this example performs: it only makes up an invoice id.
 * Replace it with the call into your system.
 */
async function createInvoice(
  release: ParmanaRelease,
): Promise<Record<string, unknown>> {
  return {
    invoiceId: `INV-${release.businessTransactionId.slice(0, 8)}`,
    customer: release.target,
    amount: release.parameters.amount,
    currency: release.parameters.currency,
  };
}

/**
 * Starts the endpoint when this file is run directly.
 */
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const publicKeyPem = process.env.PARMANA_PUBLIC_KEY_PEM;
  const audience = process.env.ENDPOINT_URL;
  const port = Number(process.env.PORT ?? 8080);

  if (publicKeyPem === undefined || audience === undefined) {
    console.error("Set PARMANA_PUBLIC_KEY_PEM and ENDPOINT_URL.");
    process.exit(2);
  }

  const handle = createReleaseHandler({
    publicKeys: { default: publicKeyPem },
    audience,
    act: createInvoice,
  });

  createServer((request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }

    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      let body: unknown;

      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ errors: ["the body is not JSON"] }));
        return;
      }

      void handle(body).then(({ status, body: answer }) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(answer));
      });
    });
  }).listen(port, () => {
    console.log(`External connector endpoint for ${audience} on port ${port}`);
  });
}
