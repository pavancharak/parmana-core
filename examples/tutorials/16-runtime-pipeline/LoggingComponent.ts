import type { RuntimeComponent } from "@parmana/runtime";

import type { RuntimeContext } from "@parmana/runtime";

/**
 * Pipeline Logging Component.
 *
 * First stage in the custom runtime pipeline.
 */
export class LoggingComponent implements RuntimeComponent {
  public async execute(context: RuntimeContext): Promise<RuntimeContext> {
    console.log();

    console.log("========================================");

    console.log(" Pipeline Stage: Logging");

    console.log("========================================");

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

    return context;
  }
}
