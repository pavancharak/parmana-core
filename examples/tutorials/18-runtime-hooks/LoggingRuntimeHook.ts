import type { RuntimeContext } from "@parmana/runtime";

/**
 * Demonstrates Runtime lifecycle hooks.
 *
 * A Runtime Hook observes lifecycle events
 * without becoming part of the Runtime Pipeline.
 */
export class LoggingRuntimeHook {
  public async beforeExecution(context: RuntimeContext): Promise<void> {
    console.log();

    console.log("========================================");

    console.log(" Hook: beforeExecution");

    console.log("========================================");

    console.log();

    console.log(`Transaction : ${context.transaction.businessTransactionId}`);

    console.log(`Action      : ${context.transaction.intent.action}`);

    console.log(`Target      : ${context.transaction.intent.target}`);

    console.log();
  }

  public async afterExecution(context: RuntimeContext): Promise<void> {
    console.log();

    console.log("========================================");

    console.log(" Hook: afterExecution");

    console.log("========================================");

    console.log();

    console.log("Execution completed successfully.");

    console.log(`Decision : ${context.decision.outcome}`);

    console.log();
  }

  public async afterVerification(_context: RuntimeContext): Promise<void> {
    console.log();

    console.log("========================================");

    console.log(" Hook: afterVerification");

    console.log("========================================");

    console.log();

    console.log("Execution Trust Record verified.");

    console.log();
  }

  public async onFailure(error: Error): Promise<void> {
    console.log();

    console.log("========================================");

    console.log(" Hook: onFailure");

    console.log("========================================");

    console.log();

    console.error(error.message);

    console.log();
  }
}
