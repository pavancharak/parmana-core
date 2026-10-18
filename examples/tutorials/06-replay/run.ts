import { readFileSync } from "node:fs";
import path from "node:path";

import { FilePolicyRepository } from "@parmana/policy";

import { ReplayEngine } from "@parmana/replay";

import { RuntimeBuilder } from "@parmana/runtime";

import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import type { BusinessTransaction } from "@parmana/shared";
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

const root = path.resolve(import.meta.dirname);

const transaction = JSON.parse(
  readFileSync(
    path.join(root, "../../shared/vendor-payment-transaction.json"),
    "utf8",
  ),
) as BusinessTransaction;

const policyRepository = new FilePolicyRepository(
  path.resolve(root, "../../../policies"),
);

const trustRecords = new MemoryExecutionTrustRecordRepository();

const runtime = new RuntimeBuilder()
  .withSignalStateVerifier(demoApprovalSignalVerifier())
  .withPolicyRepository(policyRepository)
  .build(trustRecords);

const { trustRecord } = await runtime.execute(
  await withDemoApproval(transaction),
);

const policy = await policyRepository.load(
  transaction.policy.name,
  transaction.policy.version,
);

const replay = new ReplayEngine().replay({
  trustRecord,
  transaction,
  policy,
});

console.log("========================================");
console.log(" Parmana Tutorial 06 - Replay");
console.log("========================================");

console.log();

console.log("Recorded Decision");

console.log(JSON.stringify(replay.recordedDecision, null, 2));

console.log();

console.log("Replayed Decision");

console.log(JSON.stringify(replay.replayedDecision, null, 2));

console.log();

console.log("Replay Match");

console.log(replay.matches);

console.log();

console.log("Replay Result");

console.log(JSON.stringify(replay, null, 2));

console.log();

console.log("Tutorial Complete");
console.log("Next: Tutorial 07 - Receipt Generation");
