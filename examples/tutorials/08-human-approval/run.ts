import { readFileSync } from "node:fs";
import path from "node:path";

import type { BusinessTransaction } from "@parmana/shared";

const root = path.resolve(import.meta.dirname);

const transaction = JSON.parse(
  readFileSync(path.join(root, "transaction.json"), "utf8"),
) as BusinessTransaction;

console.log("========================================");
console.log(" Parmana Tutorial 08 - Human Approval");
console.log("========================================");

console.log();

console.log("Authority");

console.log(JSON.stringify(transaction.authority, null, 2));

console.log();

console.log("Authorization");

console.log(JSON.stringify(transaction.authorization, null, 2));

console.log();

console.log("Intent");

console.log(JSON.stringify(transaction.intent, null, 2));

console.log();

console.log("Business Transaction");

console.log(JSON.stringify(transaction, null, 2));

console.log();

console.log("Authorization Chain");

console.log(
  `${transaction.authority.authorityId} → ${transaction.authorization.authorizationId} → ${transaction.intent.intentId}`,
);

console.log();

console.log(
  "This Business Transaction is authorized and ready for Runtime execution.",
);

console.log();

console.log("Tutorial Complete");
console.log("Next: Tutorial 09 - REST API");
