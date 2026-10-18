import path from "node:path";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

import { loadConfig } from "@parmana/shared";

import {
  CompositeSignalStateVerifier,
  FilePolicyRepository,
  SupabasePolicyRepository,
  type PolicyRepository,
} from "@parmana/policy";

import { PostgresPoolFactory } from "@parmana/storage";

import { RuntimeFactory } from "@parmana/runtime";

import type { ExecutionSystem } from "@parmana/execution-system";

import {
  businessTransactionRepository,
  executionTrustRecordRepository,
  refusalRecordRepository,
  businessSignalSourceRepository,
  authorityGrantRepository,
} from "./repositories.js";
import { RepositoryBusinessSignalSourceRegistry } from "./business-sources/HttpBusinessSignalSource.js";

import type { ApprovalVerifier } from "@parmana/approval";

import { createApprovalVerifier } from "./bootstrap/createApprovalVerifier.js";
import { createCurrentPolicyVersionSource } from "./bootstrap/createCurrentPolicyVersionSource.js";
import { createExternalPolicyBindingSource } from "./bootstrap/createExternalPolicyBindingSource.js";
import { createHubSpotSignalStateVerifier } from "./bootstrap/createHubSpotSignalStateVerifier.js";
import { createApprovalSignalVerifier } from "./bootstrap/createApprovalSignalVerifier.js";
import { createSlackChannelSignalVerifier } from "./bootstrap/createSlackChannelSignalVerifier.js";
import { executionGatewaySignalStateVerifier } from "./bootstrap/executionGatewaySignalStateVerifier.js";
import { createPolicyExecutionVerifier } from "./bootstrap/createPolicyExecutionVerifier.js";
import { createPolicyGovernanceAnchorResolver } from "./bootstrap/createPolicyGovernanceAnchorResolver.js";
import { createSigningReadiness } from "./bootstrap/createSigningReadiness.js";
import { createExecutionIntents } from "./bootstrap/createExecutionIntents.js";
import { createApprovalNeededNotifier } from "./bootstrap/createApprovalNeededNotifier.js";

const config = loadConfig();

/**
 * FilePolicyRepository in tests and local dev (memory storage) --
 * writable disk in both cases, and preserves existing test fixtures'
 * assumption of file-backed policy content. SupabasePolicyRepository
 * whenever a real database is configured: Vercel's serverless
 * Functions run on a read-only filesystem, so
 * PolicyChangeApprovalService.approve()'s live-policy write fails
 * with EROFS against FilePolicyRepository in production -- see
 * migration 20260916060000's own doc comment.
 *
 * Constructed lazily, on first actual repository use, not as a
 * module-scope side effect -- the same discipline repositories.ts's
 * own lazyRepository() already established (G-15,
 * docs/VERIFICATION-GAPS.md) and for the identical reason: importing
 * this module must never itself open a live Postgres connection via
 * PostgresPoolFactory.create(), only an actual load()/save()/listAll()
 * call should. An earlier version of this file got that wrong --
 * constructing SupabasePolicyRepository eagerly here meant
 * PostgresPoolFactory's singleton pool was created (against whatever
 * DATABASE_URL happened to be set at import time) before any caller
 * had a chance to configure it differently, which is exactly the
 * failure mode examples/tutorials/89-readiness-probe/run.ts's own
 * "genuinely unreachable database" scenario exists to test.
 */
let policyRepositoryInstance: PolicyRepository | undefined;

function getPolicyRepository(): PolicyRepository {
  policyRepositoryInstance ??=
    process.env.NODE_ENV !== "test" && config.storage.provider !== "memory"
      ? new SupabasePolicyRepository(PostgresPoolFactory.create())
      : new FilePolicyRepository(config.policy.directory);

  return policyRepositoryInstance;
}

export const policyRepository: PolicyRepository = new Proxy(
  {} as PolicyRepository,
  {
    get(_target, property, receiver) {
      return Reflect.get(getPolicyRepository(), property, receiver);
    },
  },
);

/**
 * One ApprovalVerifier for every capability, so an Approval Artifact is
 * single use across all of them (createApprovalVerifier.ts). It defaults
 * to the production one, which trusts only the approvers listed in
 * createApprovalIssuerRegistry.ts. Tutorials pass their own so an
 * approver key made in memory can sign approvals.
 */
export function createApplication(
  executionSystem: ExecutionSystem,
  approvalVerifier: ApprovalVerifier = createApprovalVerifier(),
) {
  const signalStateVerifier = new CompositeSignalStateVerifier([
    createHubSpotSignalStateVerifier(
      executionSystem,
      approvalVerifier,
      undefined,
      policyRepository,
    ),
    createApprovalSignalVerifier(approvalVerifier),
    // G-76: the Slack channel is checked against the server's allowlist.
    createSlackChannelSignalVerifier(),
  ]);

  //
  // G-31: binds the same composite verifier into the Execution
  // Gateway's late-bound signalStateVerifier singleton, so the exact
  // signals independently verified pre-authorization here are also
  // re-verifiable at the execution boundary -- see
  // executionGatewaySignalStateVerifier.ts's own doc comment.
  //
  executionGatewaySignalStateVerifier.bind(signalStateVerifier);

  return RuntimeFactory.create(
    businessTransactionRepository,
    executionTrustRecordRepository,
    policyRepository,
    executionSystem,
    refusalRecordRepository,
    signalStateVerifier,
    createPolicyExecutionVerifier(),
    createPolicyGovernanceAnchorResolver(),
    createSigningReadiness(),
    createExecutionIntents(),
    createCurrentPolicyVersionSource(),
    createApprovalNeededNotifier(),
    createExternalPolicyBindingSource(),
    // RFC-0023 phase 2: the business systems registered through maker
    // checker answer policies' signalSources.
    new RepositoryBusinessSignalSourceRegistry(businessSignalSourceRepository),
    // RFC-0023 phase 3: the authority grants approved through maker
    // checker, for policies with requireAuthorityGrant.
    authorityGrantRepository,
  );
}
