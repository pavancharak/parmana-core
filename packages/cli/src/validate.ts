import { CliUsageError } from "./errors.js";

/**
 * Pure checks and body builders. They do no I/O and make no network calls,
 * so every rule here can be tested directly.
 */

export type ApprovalAction = "approve" | "reject";

export interface PolicyFile {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses a policy.json file and checks the two identity fields it must carry. */
export function parsePolicyFile(text: string): PolicyFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CliUsageError("The policy file is not valid JSON.");
  }
  if (!isRecord(parsed)) {
    throw new CliUsageError("The policy file must be a JSON object.");
  }
  if (
    typeof parsed["policyId"] !== "string" ||
    parsed["policyId"].length === 0
  ) {
    throw new CliUsageError("The policy file has no policyId.");
  }
  if (
    typeof parsed["policyVersion"] !== "string" ||
    parsed["policyVersion"].length === 0
  ) {
    throw new CliUsageError("The policy file has no policyVersion.");
  }
  return parsed as PolicyFile;
}

/**
 * The name and version on the command line must match the file. Otherwise the
 * proposal would be filed under one policy but carry another policy's content.
 */
export function assertPolicyIdentity(
  policy: PolicyFile,
  name: string,
  version: string,
): void {
  if (policy.policyId !== name) {
    throw new CliUsageError(
      `The file's policyId is "${policy.policyId}", but the command names "${name}".`,
    );
  }
  if (policy.policyVersion !== version) {
    throw new CliUsageError(
      `The file's policyVersion is "${policy.policyVersion}", but the command names "${version}".`,
    );
  }
}

/** The body the proposal endpoint expects: the whole policy and a reason. */
export function buildProposalBody(
  policy: PolicyFile,
  reason: string,
): {
  proposedContent: PolicyFile;
  reason: string;
} {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new CliUsageError("A reason is required. Pass --reason.");
  }
  return { proposedContent: policy, reason: trimmed };
}

export function parseApprovalAction(value: string | undefined): ApprovalAction {
  if (value === "approve" || value === "reject") {
    return value;
  }
  throw new CliUsageError('--action must be "approve" or "reject".');
}

/**
 * Wraps a signed step-up envelope, as printed by the signing command, in the
 * request body the approve and reject endpoints read. Refuses anything that is
 * not an envelope, so a half-pasted file never reaches the server.
 */
export function buildApprovalBody(envelopeText: string): {
  stepUpAuthorization: Record<string, unknown>;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelopeText);
  } catch {
    throw new CliUsageError("The envelope file is not valid JSON.");
  }
  if (
    !isRecord(parsed) ||
    !isRecord(parsed["payload"]) ||
    typeof parsed["signature"] !== "string"
  ) {
    throw new CliUsageError(
      "The envelope file does not look like a signed step-up envelope.",
    );
  }
  return { stepUpAuthorization: parsed };
}
