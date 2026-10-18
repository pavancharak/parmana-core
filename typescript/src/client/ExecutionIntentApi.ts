/**
 * Parmana Execution Intent API (ADR-0012).
 */

import type {
  ExecutionIntent,
  ExecutionIntentView,
  FinalizeExecutionIntentResult,
  ResolveExecutionIntentInput,
  ResolveExecutionIntentResult,
  UnfinalizedExecutionIntents,
} from "../models/index.js";

import type { Transport } from "../config/Transport.js";

export class ExecutionIntentApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Verifies an Execution Intent's hash and signature. Maps to POST
   * /execution-intents/verify. Takes the intent itself, and needs no caller
   * authentication: like RefusalApi.verify(), it is the capability that makes
   * the record independently third party verifiable.
   *
   * A `true` result proves the intent was signed by the holder of the key and
   * has not been altered. It does NOT prove the action was released, or what
   * its result was.
   */
  public async verify(intent: ExecutionIntent): Promise<boolean> {
    const response = await this.transport.send<{ valid: boolean }>({
      method: "POST",
      path: "/execution-intents/verify",
      body: intent,
    });

    // Only a boolean true counts. A string "false" is truthy.
    return response.body.valid === true;
  }

  /**
   * Retrieves an Execution Intent and its status. Maps to
   * GET /execution-intents/:businessTransactionId. Behind caller
   * authentication and ownership scoping, like TrustRecordApi.get().
   */
  public async get(
    businessTransactionId: string,
  ): Promise<ExecutionIntentView> {
    const response = await this.transport.send<ExecutionIntentView>({
      method: "GET",
      path: `/execution-intents/${encodeURIComponent(businessTransactionId)}`,
    });

    return response.body;
  }

  /**
   * Lists intents that never reached a signed Trust Record and were not closed
   * by hand, oldest first. Maps to GET /execution-intents/unfinalized.
   * Requires a credential provisioned as a verified human.
   *
   * @param limit Maximum number to return. The server default is 50 and the
   * maximum is 200.
   */
  public async listUnfinalized(
    limit?: number,
  ): Promise<UnfinalizedExecutionIntents> {
    const response = await this.transport.send<UnfinalizedExecutionIntents>({
      method: "GET",
      path:
        limit === undefined
          ? "/execution-intents/unfinalized"
          : `/execution-intents/unfinalized?limit=${encodeURIComponent(String(limit))}`,
    });

    return response.body;
  }

  /**
   * Rebuilds the signed Execution Trust Record for a released action whose
   * record was never produced. Maps to POST
   * /execution-intents/:businessTransactionId/finalize. It never calls a
   * connector and is safe to run twice. Requires a credential provisioned as a
   * verified human.
   */
  public async finalize(
    businessTransactionId: string,
  ): Promise<FinalizeExecutionIntentResult> {
    const response = await this.transport.send<FinalizeExecutionIntentResult>({
      method: "POST",
      path: `/execution-intents/${encodeURIComponent(businessTransactionId)}/finalize`,
    });

    return response.body;
  }

  /**
   * Closes a PREPARED or ERRORED intent that a verified human reconciled at
   * the connector. Maps to POST /execution-intents/:businessTransactionId/resolve.
   * The note is required. It never calls a connector and is idempotent.
   *
   * The resolution is an attributed operator statement in unsigned status. It
   * is NOT tamper evident and it is NOT a Trust Record.
   */
  public async resolve(
    businessTransactionId: string,
    input: ResolveExecutionIntentInput,
  ): Promise<ResolveExecutionIntentResult> {
    const response = await this.transport.send<ResolveExecutionIntentResult>({
      method: "POST",
      path: `/execution-intents/${encodeURIComponent(businessTransactionId)}/resolve`,
      body: input,
    });

    return response.body;
  }
}
