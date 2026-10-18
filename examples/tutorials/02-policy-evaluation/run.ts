import { readFileSync } from "node:fs";
import path from "node:path";

import { PolicyEngine } from "@parmana/policy";

const root = path.resolve(import.meta.dirname);

const policy = JSON.parse(readFileSync(path.join(root, "policy.json"), "utf8"));

const signals = JSON.parse(
  readFileSync(path.join(root, "signals.json"), "utf8"),
);

const engine = new PolicyEngine();

const decision = engine.evaluate(policy, signals);

console.log("========================================");
console.log(" Parmana Tutorial 02 - Policy Evaluation");
console.log("========================================");

console.log();

console.log("Policy");

console.log(
  JSON.stringify(
    {
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      schemaVersion: policy.schemaVersion,
    },
    null,
    2,
  ),
);

console.log();

console.log("Signals");

console.log(JSON.stringify(signals, null, 2));

console.log();

console.log("Decision");

console.log(JSON.stringify(decision, null, 2));

console.log();

console.log("Tutorial Complete");
console.log("Next: Tutorial 03 - Runtime Execution");
