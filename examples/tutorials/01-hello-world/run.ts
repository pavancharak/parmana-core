import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname);

const transaction = JSON.parse(
  readFileSync(path.join(root, "transaction.json"), "utf8"),
);

const policy = JSON.parse(readFileSync(path.join(root, "policy.json"), "utf8"));

transaction.policy = policy;

console.log("========================================");
console.log(" Parmana Tutorial 01 - Hello World");
console.log("========================================");

console.log();

console.log("Business Transaction");

console.log(JSON.stringify(transaction, null, 2));

console.log();

console.log("Tutorial Complete");
console.log("Next: Tutorial 02 - Policy Evaluation");
