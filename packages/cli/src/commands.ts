import { spawnSync } from "node:child_process";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";

import { PolicyChangeStepUpAuthorizationSigner } from "@parmana/crypto";

import { renderCompletion, type ShellName } from "./completion.js";
import {
  configPath,
  parseConfigFile,
  requireToken,
  resolveTarget,
  type ConfigFile,
} from "./config.js";
import { CliFailure, CliUsageError } from "./errors.js";
import { hintFor, parseServerError } from "./hints.js";
import {
  buildRequest,
  displayRequest,
  send,
  type RequestSpec,
  type Target,
} from "./http.js";
import { redactText } from "./redact.js";
import {
  assertPolicyIdentity,
  buildApprovalBody,
  buildProposalBody,
  parseApprovalAction,
  parsePolicyFile,
} from "./validate.js";

/** Step-up envelopes expire after two minutes, the same as the signing script. */
export const STEP_UP_TTL_SECONDS = 120;

export interface Settings {
  readonly format: "text" | "json";
  readonly dryRun: boolean;
  readonly verbose: boolean;
  readonly timeoutMs: number;
  readonly flagProfile: string | undefined;
  readonly flagApiUrl: string | undefined;
}

/** Everything the commands touch from outside the process, so tests can replace it. */
export interface Runtime {
  readonly env: NodeJS.ProcessEnv;
  readonly homeDir: string;
  readonly fetch: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly log: (line: string) => void;
  readonly readText: (path: string) => string | undefined;
  readonly writeText: (path: string, text: string) => void;
  /** The approval-log script, found from the current folder upward; undefined if none. */
  readonly findLogScript: () => string | undefined;
  readonly runScript: (script: string, args: readonly string[]) => number;
}

export interface CommandResult {
  readonly code: number;
  readonly data: unknown;
  readonly text: string;
}

export interface ParsedCommand {
  readonly id: string;
  readonly args: readonly string[];
  readonly values: Readonly<Record<string, string | boolean | undefined>>;
}

function str(
  values: ParsedCommand["values"],
  name: string,
): string | undefined {
  const value = values[name];
  return typeof value === "string" ? value : undefined;
}

function loadConfig(runtime: Runtime): ConfigFile | undefined {
  const text = runtime.readText(configPath(runtime.env, runtime.homeDir));
  return text === undefined ? undefined : parseConfigFile(text);
}

/** Builds the target. A dry run needs no token; a real request does. */
function targetFor(
  settings: Settings,
  runtime: Runtime,
  needsToken: boolean,
): Target {
  const resolved = resolveTarget({
    flagProfile: settings.flagProfile,
    flagApiUrl: settings.flagApiUrl,
    env: runtime.env,
    config: loadConfig(runtime),
  });
  const token =
    needsToken && !settings.dryRun
      ? requireToken(runtime.env)
      : (runtime.env["PARMANA_TOKEN"] ?? "<token>");
  return {
    baseUrl: resolved.baseUrl,
    token,
    timeoutMs: settings.timeoutMs,
    verbose: settings.verbose,
  };
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function dryRunResult(spec: RequestSpec, target: Target): CommandResult {
  const built = buildRequest(target, spec);
  const shown = displayRequest(built, [target.token]);
  return {
    code: 0,
    data: {
      dryRun: true,
      method: built.method,
      url: built.url,
      body:
        built.body === undefined
          ? null
          : tryJson(redactText(built.body, [target.token])),
    },
    text: `Dry run. Nothing was sent.\n\n${shown}\n`,
  };
}

/** Success when the status is the expected one; otherwise a failure with the next step. */
function fromResponse(
  status: number,
  body: string,
  expected: number,
  success: (parsed: unknown) => string,
  secrets: readonly string[],
): CommandResult {
  const parsed = tryJson(body);
  if (status === expected) {
    return { code: 0, data: parsed, text: success(parsed) };
  }
  const error = parseServerError(status, body);
  const hint = hintFor(error);
  const label = error.code !== undefined ? ` ${error.code}` : "";
  const message = redactText(
    `HTTP ${status}${label}: ${error.message}`,
    secrets,
  );
  return {
    code: 1,
    data: {
      error: { status, code: error.code ?? null, message: error.message },
      hint: hint ?? null,
    },
    text: hint === undefined ? `${message}\n` : `${message}\nHint: ${hint}\n`,
  };
}

async function policyStatus(
  parsed: ParsedCommand,
  settings: Settings,
  runtime: Runtime,
): Promise<CommandResult> {
  const [name, version] = parsed.args;
  if (name === undefined || version === undefined) {
    throw new CliUsageError(
      "Usage: parmana-ops policy status <name> <version>",
    );
  }
  const target = targetFor(settings, runtime, true);
  const spec: RequestSpec = {
    method: "GET",
    path: "/policies/pending-changes?status=PENDING_APPROVAL",
  };
  if (settings.dryRun) return dryRunResult(spec, target);

  const response = await send(target, spec, runtime);
  return fromResponse(
    response.status,
    response.body,
    200,
    (body) => {
      const changes =
        (body as { changes?: Array<Record<string, unknown>> }).changes ?? [];
      const matches = changes.filter(
        (change) =>
          change["policyName"] === name && change["policyVersion"] === version,
      );
      if (matches.length === 0)
        return `No pending change for ${name} ${version}.\n`;
      return matches
        .map(
          (change) =>
            `${String(change["pendingPolicyChangeId"])}  ${name} ${version}  ${String(change["status"])}  ` +
            `proposed by ${String(change["proposedBy"])} at ${String(change["proposedAt"])}\n`,
        )
        .join("");
    },
    [target.token],
  );
}

async function policyPropose(
  parsed: ParsedCommand,
  settings: Settings,
  runtime: Runtime,
): Promise<CommandResult> {
  const [file] = parsed.args;
  const name = str(parsed.values, "name");
  const version = str(parsed.values, "version");
  const reason = str(parsed.values, "reason");
  if (
    file === undefined ||
    name === undefined ||
    version === undefined ||
    reason === undefined
  ) {
    throw new CliUsageError(
      'Usage: parmana-ops policy propose <policy.json> --name <name> --version <version> --reason "<why>"',
    );
  }
  const text = runtime.readText(file);
  if (text === undefined) throw new CliUsageError(`Cannot read ${file}.`);
  const policy = parsePolicyFile(text);
  assertPolicyIdentity(policy, name, version);
  const body = JSON.stringify(buildProposalBody(policy, reason));
  const target = targetFor(settings, runtime, true);
  const spec: RequestSpec = {
    method: "POST",
    path: `/policies/${encodeURIComponent(name)}/${encodeURIComponent(version)}/pending-changes`,
    body,
  };
  if (settings.dryRun) return dryRunResult(spec, target);

  const response = await send(target, spec, runtime);
  return fromResponse(
    response.status,
    response.body,
    201,
    (body) => {
      const id = (body as { pendingPolicyChangeId?: unknown })
        .pendingPolicyChangeId;
      return `Proposed ${name} ${version}. Pending change: ${String(id)}\n`;
    },
    [target.token],
  );
}

async function approvalSign(
  parsed: ParsedCommand,
  _settings: Settings,
  runtime: Runtime,
): Promise<CommandResult> {
  const keyFile = str(parsed.values, "key-file");
  const keyId = str(parsed.values, "key-id");
  const pending = str(parsed.values, "pending");
  const outFile = str(parsed.values, "out");
  if (keyFile === undefined || keyId === undefined || pending === undefined) {
    throw new CliUsageError(
      "Usage: parmana-ops approval sign --key-file <pem> --key-id <id> --pending <id> --action <approve|reject> [--out <file>]",
    );
  }
  const action = parseApprovalAction(str(parsed.values, "action"));
  const keyText = runtime.readText(keyFile);
  if (keyText === undefined)
    throw new CliUsageError(`Cannot read the key file ${keyFile}.`);
  let privateKey: ReturnType<typeof createPrivateKey>;
  try {
    privateKey = createPrivateKey(keyText);
  } catch {
    // Name the mistake instead of passing OpenSSL's decoder message through.
    let isPublic: boolean;
    try {
      createPublicKey(keyText);
      isPublic = true;
    } catch {
      isPublic = false;
    }
    throw new CliUsageError(
      isPublic
        ? `${keyFile} is a public key. Sign with the private key that was generated with it.`
        : `${keyFile} is not a readable private key in PEM format.`,
    );
  }
  const signer = new PolicyChangeStepUpAuthorizationSigner();
  const envelope = await signer.sign(
    { pendingPolicyChangeId: pending, action },
    privateKey,
    keyId,
    STEP_UP_TTL_SECONDS,
  );
  const line = JSON.stringify(envelope);
  const expiresAt = envelope.payload.expiresAt;
  if (outFile !== undefined) {
    runtime.writeText(outFile, line);
    return {
      code: 0,
      data: {
        envelopeFile: outFile,
        expiresAt,
        action,
        pendingPolicyChangeId: pending,
      },
      text: `Envelope written to ${outFile}. It expires at ${expiresAt}, ${STEP_UP_TTL_SECONDS} seconds after signing.\n`,
    };
  }
  return {
    code: 0,
    data: { envelope, expiresAt, action, pendingPolicyChangeId: pending },
    text: `${line}\n`,
  };
}

async function approvalSubmit(
  parsed: ParsedCommand,
  settings: Settings,
  runtime: Runtime,
): Promise<CommandResult> {
  const pending = str(parsed.values, "pending");
  const envelopeFile = str(parsed.values, "envelope");
  if (pending === undefined || envelopeFile === undefined) {
    throw new CliUsageError(
      "Usage: parmana-ops approval submit --pending <id> --action <approve|reject> --envelope <file>",
    );
  }
  const action = parseApprovalAction(str(parsed.values, "action"));
  const envelopeText = runtime.readText(envelopeFile);
  if (envelopeText === undefined)
    throw new CliUsageError(`Cannot read ${envelopeFile}.`);
  const body = JSON.stringify(buildApprovalBody(envelopeText));
  const target = targetFor(settings, runtime, true);
  const spec: RequestSpec = {
    method: "POST",
    path: `/policies/pending-changes/${encodeURIComponent(pending)}/${action}`,
    body,
  };
  if (settings.dryRun) return dryRunResult(spec, target);

  const response = await send(target, spec, runtime);
  return fromResponse(
    response.status,
    response.body,
    200,
    (body) => {
      const status = (body as { status?: unknown }).status;
      const verb = action === "approve" ? "Approved" : "Rejected";
      return `${verb} ${pending}. Status: ${String(status ?? "recorded")}\n`;
    },
    [target.token],
  );
}

function logCommand(
  subcommand: "verify" | "export" | "check-db",
  parsed: ParsedCommand,
  runtime: Runtime,
): CommandResult {
  const flags: string[] = [];
  const policy = str(parsed.values, "policy");
  const base = str(parsed.values, "base");
  if (policy !== undefined) flags.push("--policy", policy);
  if (base !== undefined) flags.push("--base", base);
  if (parsed.values["require-coverage"] === true)
    flags.push("--require-coverage");
  const script = runtime.findLogScript();
  if (script === undefined) {
    throw new CliUsageError(
      "Run this inside the parmana-core repository: scripts/policy-approval-log.ts was not found in this folder or any folder above it.",
    );
  }
  const exitCode = runtime.runScript(script, [subcommand, ...flags]);
  return { code: exitCode, data: { subcommand, exitCode }, text: "" };
}

function completion(parsed: ParsedCommand): CommandResult {
  const [shell] = parsed.args;
  if (shell !== "bash" && shell !== "powershell") {
    throw new CliUsageError("Usage: parmana-ops completion <bash|powershell>");
  }
  const script = renderCompletion(shell as ShellName);
  return { code: 0, data: { shell, script }, text: script };
}

const APPROVER_ID = /^[A-Za-z0-9._-]{1,128}$/;
const CAPABILITY = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const MAX_CAPABILITIES = 50;

function requireApproverId(value: string | undefined, flag: string): string {
  if (value === undefined || !APPROVER_ID.test(value)) {
    throw new CliUsageError(`${flag} must match ^[A-Za-z0-9._-]{1,128}$.`);
  }
  return value;
}

/** Comma-separated capability names, deduplicated, at most MAX_CAPABILITIES. */
export function parseCapabilities(text: string | undefined): string[] {
  if (text === undefined) {
    throw new CliUsageError(
      "--capabilities is required: a comma-separated list, for example razorpay:refund.",
    );
  }
  const list = [
    ...new Set(
      text
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
    ),
  ];
  if (
    list.length === 0 ||
    list.length > MAX_CAPABILITIES ||
    !list.every((c) => CAPABILITY.test(c))
  ) {
    throw new CliUsageError(
      `--capabilities must be 1 to ${MAX_CAPABILITIES} capability names, each matching ^[a-z0-9][a-z0-9._:-]{0,127}$.`,
    );
  }
  return list;
}

async function approverList(
  parsed: ParsedCommand,
  settings: Settings,
  runtime: Runtime,
): Promise<CommandResult> {
  const status = str(parsed.values, "status");
  const query =
    status === undefined ? "" : `?status=${encodeURIComponent(status)}`;
  const target = targetFor(settings, runtime, true);
  const spec: RequestSpec = {
    method: "GET",
    path: `/approval-issuers/changes${query}`,
  };
  if (settings.dryRun) return dryRunResult(spec, target);

  const response = await send(target, spec, runtime);
  return fromResponse(
    response.status,
    response.body,
    200,
    (body) => {
      const changes =
        (body as { changes?: Record<string, unknown>[] }).changes ?? [];
      if (changes.length === 0) return "No approver changes.\n";
      const lines = changes.map(
        (c) =>
          `${String(c["changeId"])}  ${String(c["action"])}  ${String(c["approverId"])}  ${String(c["keyId"])}  ${String(c["status"])}`,
      );
      return `${lines.join("\n")}\n`;
    },
    [target.token],
  );
}

async function approverPropose(
  parsed: ParsedCommand,
  settings: Settings,
  runtime: Runtime,
  action: "add" | "revoke",
): Promise<CommandResult> {
  const approverId = requireApproverId(
    str(parsed.values, "approver"),
    "--approver",
  );
  const keyId = requireApproverId(str(parsed.values, "key"), "--key");
  const reason = str(parsed.values, "reason");
  if (reason === undefined || reason.trim().length === 0) {
    throw new CliUsageError('--reason is required, for example "rotation".');
  }

  let body: Record<string, unknown>;
  if (action === "add") {
    const keyFile = str(parsed.values, "public-key-file");
    if (keyFile === undefined) {
      throw new CliUsageError("--public-key-file is required to add a key.");
    }
    const publicKeyPem = runtime.readText(keyFile);
    if (publicKeyPem === undefined) {
      throw new CliUsageError(`Cannot read ${keyFile}.`);
    }
    body = {
      action,
      approverId,
      keyId,
      publicKeyPem,
      capabilities: parseCapabilities(str(parsed.values, "capabilities")),
      reason,
    };
  } else {
    body = { action, approverId, keyId, reason };
  }

  const target = targetFor(settings, runtime, true);
  const spec: RequestSpec = {
    method: "POST",
    path: "/approval-issuers/changes",
    body: JSON.stringify(body),
  };
  if (settings.dryRun) return dryRunResult(spec, target);

  const response = await send(target, spec, runtime);
  return fromResponse(
    response.status,
    response.body,
    201,
    (body) => {
      const id = (body as { changeId?: unknown }).changeId;
      return `Proposed ${action} of ${approverId} key ${keyId}. Change: ${String(id)}\n`;
    },
    [target.token],
  );
}

async function approverSubmit(
  parsed: ParsedCommand,
  settings: Settings,
  runtime: Runtime,
): Promise<CommandResult> {
  const change = str(parsed.values, "change");
  const envelopeFile = str(parsed.values, "envelope");
  if (change === undefined || envelopeFile === undefined) {
    throw new CliUsageError(
      "Usage: parmana-ops approver submit --change <id> --action <approve|reject> --envelope <file> [--reason <why>]",
    );
  }
  const action = parseApprovalAction(str(parsed.values, "action"));
  const reason = str(parsed.values, "reason");
  if (
    action === "reject" &&
    (reason === undefined || reason.trim().length === 0)
  ) {
    throw new CliUsageError(
      '--reason is required to reject, for example "not needed".',
    );
  }
  const envelopeText = runtime.readText(envelopeFile);
  if (envelopeText === undefined) {
    throw new CliUsageError(`Cannot read ${envelopeFile}.`);
  }
  const stepUp = buildApprovalBody(envelopeText);
  const body =
    action === "reject" ? { rejectionReason: reason, ...stepUp } : stepUp;

  const target = targetFor(settings, runtime, true);
  const spec: RequestSpec = {
    method: "POST",
    path: `/approval-issuers/changes/${encodeURIComponent(change)}/${action}`,
    body: JSON.stringify(body),
  };
  if (settings.dryRun) return dryRunResult(spec, target);

  const response = await send(target, spec, runtime);
  return fromResponse(
    response.status,
    response.body,
    200,
    () => {
      const verb = action === "approve" ? "Approved" : "Rejected";
      return `${verb} approver change ${change}.\n`;
    },
    [target.token],
  );
}

/** Runs one command. Usage problems and failures are thrown as CliError subclasses. */
export async function runCommand(
  parsed: ParsedCommand,
  settings: Settings,
  runtime: Runtime,
): Promise<CommandResult> {
  switch (parsed.id) {
    case "policy status":
      return policyStatus(parsed, settings, runtime);
    case "policy propose":
      return policyPropose(parsed, settings, runtime);
    case "approval sign":
      return approvalSign(parsed, settings, runtime);
    case "approval submit":
      return approvalSubmit(parsed, settings, runtime);
    case "approver list":
      return approverList(parsed, settings, runtime);
    case "approver propose-add":
      return approverPropose(parsed, settings, runtime, "add");
    case "approver propose-revoke":
      return approverPropose(parsed, settings, runtime, "revoke");
    case "approver submit":
      return approverSubmit(parsed, settings, runtime);
    case "log verify":
      return logCommand("verify", parsed, runtime);
    case "log export":
      return logCommand("export", parsed, runtime);
    case "log check-db":
      return logCommand("check-db", parsed, runtime);
    case "completion":
      return completion(parsed);
    default:
      throw new CliUsageError(`Unknown command: ${parsed.id}`);
  }
}

/** The real runtime: process environment, the global fetch, and the real clock. */
export function defaultRuntime(): Runtime {
  return {
    env: process.env,
    homeDir: homedir(),
    fetch: globalThis.fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => process.stderr.write(`${line}\n`),
    readText: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return undefined;
      }
    },
    writeText: (path, text) => writeFileSync(path, text, { encoding: "utf8" }),
    findLogScript: () =>
      findUpward(process.cwd(), join("scripts", "policy-approval-log.ts")),
    runScript: (script, args) => {
      const result = spawnSync("npx", ["tsx", script, ...args], {
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      if (result.error !== undefined) {
        throw new CliFailure(
          `Could not start the log script: ${result.error.message}`,
        );
      }
      return result.status ?? 1;
    },
  };
}

/** The first folder, from start upward, that contains the relative path; undefined if none does. */
export function findUpward(
  start: string,
  relative: string,
): string | undefined {
  let dir = start;
  for (;;) {
    const candidate = join(dir, relative);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
