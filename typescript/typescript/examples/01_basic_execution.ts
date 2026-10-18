/**
 * Parmana TypeScript SDK
 *
 * Example 01
 *
 * Basic Execution
 */

import {
  Authority,
  Authorization,
  BusinessTransaction,
  Intent,
  ParmanaClient,
  PolicyReference,
} from "../src/index.js";

async function main(): Promise<void> {
  const client = new ParmanaClient({
    endpoint: "http://localhost:8080",
  });

  const authority: Authority = {
    authorityId: "authority-001",
    authorityName: "Acme Corporation",
    createdAt: new Date(),
  };

  const authorization: Authorization = {
    authorizationId: "authorization-001",
    authorityId: authority.authorityId,
    subject: "warehouse-robot-01",
    permissions: ["MOVE_PALLET"],
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };

  const intent: Intent = {
    intentId: "intent-001",
    authorizationId: authorization.authorizationId,
    operation: "MOVE_PALLET",
    target: "Loading Bay 3",
    createdAt: new Date(),
  };

  const policy: PolicyReference = {
    policyName: "warehouse-policy",
    policyVersion: "1.0.0",
  };

  const transaction: BusinessTransaction = {
    businessTransactionId: "txn-001",
    authority,
    authorization,
    intent,
    policy,
    createdAt: new Date(),
  };

  console.log();
  console.log("======================================");
  console.log(" Parmana TypeScript SDK");
  console.log(" Example 01 - Basic Execution");
  console.log("======================================");
  console.log();

  console.log("Business Transaction");
  console.log("--------------------");
  console.log("Transaction:", transaction.businessTransactionId);
  console.log("Authority :", authority.authorityName);
  console.log("Intent    :", intent.operation);
  console.log("Policy    :", `${policy.policyName} (${policy.policyVersion})`);
  console.log();

  try {
    const receipt = await client.execute(transaction);

    console.log("Execution Receipt");
    console.log("-----------------");
    console.log("Receipt ID :", receipt.receiptId);
    console.log("Algorithm  :", receipt.algorithm);
    console.log("Issued At  :", receipt.issuedAt);
  } catch (error) {
    console.log();
    console.error("Runtime not available (expected during SDK development).");

    if (error instanceof Error) {
      console.error(error.message);
    }
  }

  console.log();
  console.log("Example completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
