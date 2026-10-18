import { readFileSync } from "node:fs";
import path from "node:path";

import { FilePolicyRepository, PolicyRouter } from "@parmana/policy";

import type { BusinessTransaction } from "@parmana/shared";

const root = path.resolve(import.meta.dirname);

const transaction = JSON.parse(
  readFileSync(path.join(root, "transaction.json"), "utf8"),
) as BusinessTransaction;

const policyRepository = new FilePolicyRepository(
  path.resolve(root, "../../../policies"),
);

const router = new PolicyRouter(policyRepository);

const policy = await router.load(
  transaction.policy.name,
  transaction.policy.version,
);

console.log("========================================");
console.log(" Parmana Tutorial 04 - Policy Router");
console.log("========================================");

console.log();

console.log("Policy Reference");

console.log(JSON.stringify(transaction.policy, null, 2));

console.log();

console.log("Resolved Policy");

console.log(
  JSON.stringify(
    {
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      schemaVersion: policy.schemaVersion,
      ruleCount: policy.rules.length,
    },
    null,
    2,
  ),
);

console.log();

console.log("Loaded Policy");

console.log(JSON.stringify(policy, null, 2));

console.log();

console.log("Tutorial Complete");
console.log("Next: Tutorial 05 - Verification");
