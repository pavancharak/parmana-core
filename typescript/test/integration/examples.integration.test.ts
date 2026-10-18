/**
 * Parmana TypeScript SDK
 *
 * Proves the documented example this repo ships
 * (typescript/examples/02-execute.ts, the closest TS equivalent to
 * python/examples/quickstart/run.py) actually works against a real
 * running server -- not just that it compiles. Neither example was
 * previously exercised by any test: typescript/examples/ is excluded
 * from typescript/tsconfig.json's own include list, so nothing ever
 * built or ran it, and it silently imported a package name
 * (@parmana/typescript-sdk) that has never existed in this repo, plus
 * two further bugs (AuthorityType/BusinessTransactionStatus used as
 * runtime enums that don't exist on this SDK's string-typed models;
 * client.replay() passed an object where it takes a plain string) --
 * all found and fixed by this dogfooding pass, not hypothetical.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";

import { signTestApproval } from "../../../test-support/approvals.js";

/**
 * What a trusted approver signs for both examples: this capability,
 * this target, up to this amount. Signed by the hermetic test approver.
 */
async function exampleApproval(): Promise<unknown> {
  return JSON.parse(
    JSON.stringify(
      await signTestApproval({
        capability: "test:fixture-execute",
        resourceId: "vendor/vendor-123",
        value: 100,
      }),
    ),
  );
}

let server: Server;
let endpoint: string;

beforeAll(async () => {
  process.env.PARMANA_POLICY_DIR = fileURLToPath(
    new URL("../../../policies", import.meta.url),
  );

  // Deliberately dynamic imports, deferred until after PARMANA_POLICY_DIR
  // above is set -- see parmana-client.integration.test.ts's identical,
  // more thoroughly documented pattern for exactly why createApp and
  // createApplication both need this.
  const { createApplication } =
    await import("../../../packages/api/src/application.js");
  const { createApp } = await import("../../../packages/api/src/app.js");
  const { createExecutionSystem } =
    await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");

  const executionSystem = await createExecutionSystem();
  const application = createApplication(executionSystem);

  // callerAuth: "disabled", no apiKey -- matches the example's own
  // ParmanaClient construction exactly (it never sets one either), and
  // is the real, documented way to run this example locally.
  const app = createApp(application, {
    callerAuth: "disabled",
  });

  server = await new Promise<Server>((resolve) => {
    const httpServer = app.listen(0, "127.0.0.1", () => resolve(httpServer));
  });

  const address = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("typescript/examples/02-execute.ts against a real local @parmana/api instance", () => {
  it("runs end to end and returns a real, signed, APPROVED Execution Trust Record", async () => {
    const { runExecuteExample } = await import("../../examples/02-execute.js");

    const trustRecord = await runExecuteExample(
      endpoint,
      await exampleApproval(),
    );

    expect(trustRecord.trustRecordId).toBeTruthy();
    expect(trustRecord.executions).toHaveLength(1);
    expect(trustRecord.executions[0]?.decision.outcome).toBe("APPROVED");
    expect(trustRecord.signature.algorithm).toBe("ed25519");
  });
});

describe("typescript/examples/02-execute.ts without a signed human approval", () => {
  it("is refused", async () => {
    const { runExecuteExample } = await import("../../examples/02-execute.js");

    await expect(runExecuteExample(endpoint, undefined)).rejects.toThrow();
  });
});

describe("typescript/examples/06-create-business-transaction.ts against a real local @parmana/api instance", () => {
  it("runs end to end via createBusinessTransaction() and returns a real, signed, APPROVED Execution Trust Record", async () => {
    const { runCreateBusinessTransactionExample } =
      await import("../../examples/06-create-business-transaction.js");

    const trustRecord = await runCreateBusinessTransactionExample(
      endpoint,
      await exampleApproval(),
    );

    expect(trustRecord.trustRecordId).toBeTruthy();
    expect(trustRecord.executions).toHaveLength(1);
    expect(trustRecord.executions[0]?.decision.outcome).toBe("APPROVED");
    expect(trustRecord.signature.algorithm).toBe("ed25519");

    // The property this example exists to prove: every id pair the
    // builder derives round-trips correctly through a real server,
    // not just in isolated unit tests (createBusinessTransaction.test.ts).
    expect(trustRecord.transaction.metadata.businessTransactionId).toBe(
      trustRecord.businessTransactionId,
    );
    expect(trustRecord.transaction.authorization.authorityId).toBe(
      trustRecord.transaction.authority.authorityId,
    );
    expect(trustRecord.transaction.intent.authorizationId).toBe(
      trustRecord.transaction.authorization.authorizationId,
    );
  });
});
