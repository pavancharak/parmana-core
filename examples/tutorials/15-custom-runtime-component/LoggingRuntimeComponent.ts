import type { RuntimeComponent } from "@parmana/runtime";

import type { RuntimeContext } from "@parmana/runtime";

/**
 * Logging Runtime Component.
 *
 * Demonstrates how to extend the Parmana Runtime
 * without modifying the runtime itself.
 *
 * This component observes the Runtime Context,
 * logs useful execution information, and passes
 * the context to the next runtime stage unchanged.
 */
export class LoggingRuntimeComponent implements RuntimeComponent {
  public async execute(context: RuntimeContext): Promise<RuntimeContext> {
    console.log();

    console.log("----------------------------------------");

    console.log(" Logging Runtime Component");

    console.log("----------------------------------------");

    console.log();

    console.log("Business Transaction");

    console.log(context.transaction.businessTransactionId);

    console.log();

    console.log("Policy");

    console.log(
      `${context.transaction.policy.name}@${context.transaction.policy.version}`,
    );

    console.log();

    console.log("Action");

    console.log(context.transaction.intent.action);

    console.log();

    console.log("Target");

    console.log(context.transaction.intent.target);

    console.log();

    console.log("----------------------------------------");

    console.log();

    //
    // Continue the runtime unchanged.
    //
    return context;
  }
}
