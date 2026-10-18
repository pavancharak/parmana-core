import type { RuntimeComponent } from "@parmana/runtime";

import type { RuntimeContext } from "@parmana/runtime";

/**
 * Pipeline Notification Component.
 *
 * Demonstrates how organizations can plug
 * notification systems into the Parmana
 * Runtime Pipeline.
 *
 * This example simply logs notifications.
 * Production implementations might send
 * Slack, Teams, email, PagerDuty, webhooks,
 * or audit events.
 */
export class NotificationComponent implements RuntimeComponent {
  public async execute(context: RuntimeContext): Promise<RuntimeContext> {
    console.log();

    console.log("========================================");

    console.log(" Pipeline Stage: Notification");

    console.log("========================================");

    console.log();

    console.log("Preparing execution notification...");

    console.log();

    console.log(`Transaction : ${context.transaction.businessTransactionId}`);

    console.log(`Decision    : ${context.decision.outcome}`);

    console.log(`Policy      : ${context.transaction.policy.name}`);

    console.log(`Action      : ${context.transaction.intent.action}`);

    console.log();

    console.log("Notification delivered.");

    console.log();

    return context;
  }
}
