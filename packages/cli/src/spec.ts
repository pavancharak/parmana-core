/**
 * The single source of truth for the command line: every command, its
 * arguments and flags, its environment variables, and its help text. Parsing,
 * validation, help and shell completion are all generated from this table.
 */

export type FlagType = "string" | "boolean";

export interface FlagSpec {
  readonly type: FlagType;
  readonly help: string;
}

export interface CommandSpec {
  readonly id: string;
  readonly usage: string;
  readonly summary: string;
  readonly positionals: number;
  readonly flags: Readonly<Record<string, FlagSpec>>;
  readonly env: readonly string[];
  readonly example: string;
}

/** Flags every command accepts. */
export const GLOBAL_FLAGS: Readonly<Record<string, FlagSpec>> = {
  output: { type: "string", help: "Output format: text (default) or json." },
  profile: { type: "string", help: "Named API address from the config file." },
  "api-url": {
    type: "string",
    help: "API address; overrides PARMANA_API_URL and the profile.",
  },
  "dry-run": { type: "boolean", help: "Print the request without sending it." },
  verbose: {
    type: "boolean",
    help: "Log each request and response code, with secrets removed.",
  },
  timeout: {
    type: "string",
    help: "Seconds to wait for each request (default 30).",
  },
  help: { type: "boolean", help: "Show help for this command." },
};

export const COMMANDS: readonly CommandSpec[] = [
  {
    id: "policy status",
    usage: "parmana policy status <name> <version>",
    summary: "List pending policy changes for one policy version.",
    positionals: 2,
    flags: {},
    env: [
      "PARMANA_TOKEN",
      "PARMANA_API_URL",
      "PARMANA_PROFILE",
      "PARMANA_CONFIG",
    ],
    example: "parmana policy status customer-refund 1.3.0",
  },
  {
    id: "policy propose",
    usage:
      'parmana policy propose <policy.json> --name <name> --version <version> --reason "<why>"',
    summary:
      "Propose a policy change. The file must match the name and version.",
    positionals: 1,
    flags: {
      name: {
        type: "string",
        help: "Policy name; must equal the file's policyId.",
      },
      version: {
        type: "string",
        help: "Policy version; must equal the file's policyVersion.",
      },
      reason: { type: "string", help: "Why the change is needed. Required." },
    },
    env: [
      "PARMANA_TOKEN",
      "PARMANA_API_URL",
      "PARMANA_PROFILE",
      "PARMANA_CONFIG",
    ],
    example:
      'parmana policy propose policy.json --name customer-refund --version 1.3.0 --reason "Refuse all refunds" --dry-run',
  },
  {
    id: "approval sign",
    usage:
      "parmana approval sign --key-file <private.pem> --key-id <id> --pending <id> --action <approve|reject> [--out <file>]",
    summary:
      "Sign a step-up envelope on the checker's own machine. Nothing is sent.",
    positionals: 0,
    flags: {
      "key-file": {
        type: "string",
        help: "The checker's step-up private key (PEM). Never leaves this machine.",
      },
      "key-id": {
        type: "string",
        help: "The key label the operator registered for the checker.",
      },
      pending: { type: "string", help: "The pending change ID." },
      action: { type: "string", help: "approve or reject." },
      out: {
        type: "string",
        help: "Write the envelope to this file instead of stdout.",
      },
    },
    env: [],
    example:
      "parmana approval sign --key-file .\\checker.step-up.private.pem --key-id mamta-checker --pending <id> --action approve --out envelope.json",
  },
  {
    id: "approval submit",
    usage:
      "parmana approval submit --pending <id> --action <approve|reject> --envelope <file>",
    summary: "Send a signed envelope with the checker's own token.",
    positionals: 0,
    flags: {
      pending: { type: "string", help: "The pending change ID." },
      action: { type: "string", help: "approve or reject." },
      envelope: { type: "string", help: "The file written by approval sign." },
    },
    env: [
      "PARMANA_TOKEN",
      "PARMANA_API_URL",
      "PARMANA_PROFILE",
      "PARMANA_CONFIG",
    ],
    example:
      "parmana approval submit --pending <id> --action approve --envelope envelope.json --dry-run",
  },
  {
    id: "approver list",
    usage:
      "parmana approver list [--status <PENDING_APPROVAL|APPROVED|REJECTED>]",
    summary: "List approver-key changes (add or revoke), optionally by status.",
    positionals: 0,
    flags: {
      status: { type: "string", help: "Only changes with this status." },
    },
    env: [
      "PARMANA_TOKEN",
      "PARMANA_API_URL",
      "PARMANA_PROFILE",
      "PARMANA_CONFIG",
    ],
    example: "parmana approver list --status PENDING_APPROVAL",
  },
  {
    id: "approver propose-add",
    usage:
      "parmana approver propose-add --approver <id> --key <id> --public-key-file <pem> --capabilities <a,b> --reason <why>",
    summary: "Propose adding an approver key, granted the listed capabilities.",
    positionals: 0,
    flags: {
      approver: { type: "string", help: "The approver ID." },
      key: { type: "string", help: "The key ID." },
      "public-key-file": {
        type: "string",
        help: "The Ed25519 public key, PEM.",
      },
      capabilities: {
        type: "string",
        help: "Comma-separated capability names.",
      },
      reason: { type: "string", help: "Why the key is being added." },
    },
    env: [
      "PARMANA_TOKEN",
      "PARMANA_API_URL",
      "PARMANA_PROFILE",
      "PARMANA_CONFIG",
    ],
    example:
      "parmana approver propose-add --approver pavan --key pavan-key-1 --public-key-file pavan.public.pem --capabilities razorpay:refund --reason rotation --dry-run",
  },
  {
    id: "approver propose-revoke",
    usage:
      "parmana approver propose-revoke --approver <id> --key <id> --reason <why>",
    summary:
      "Propose revoking an approver key that was added through approver changes.",
    positionals: 0,
    flags: {
      approver: { type: "string", help: "The approver ID." },
      key: { type: "string", help: "The key ID." },
      reason: { type: "string", help: "Why the key is being revoked." },
    },
    env: [
      "PARMANA_TOKEN",
      "PARMANA_API_URL",
      "PARMANA_PROFILE",
      "PARMANA_CONFIG",
    ],
    example:
      "parmana approver propose-revoke --approver manager-charak1987 --key manager-charak1987-key-2 --reason rotation --dry-run",
  },
  {
    id: "approver submit",
    usage:
      "parmana approver submit --change <id> --action <approve|reject> --envelope <file> [--reason <why>]",
    summary:
      "Approve or reject an approver change, with the checker's signed step-up envelope.",
    positionals: 0,
    flags: {
      change: { type: "string", help: "The approver change ID." },
      action: { type: "string", help: "approve or reject." },
      envelope: { type: "string", help: "The file written by approval sign." },
      reason: {
        type: "string",
        help: "Required with reject: why it is rejected.",
      },
    },
    env: [
      "PARMANA_TOKEN",
      "PARMANA_API_URL",
      "PARMANA_PROFILE",
      "PARMANA_CONFIG",
    ],
    example:
      "parmana approver submit --change <id> --action approve --envelope step.json --dry-run",
  },
  {
    id: "log verify",
    usage:
      "parmana log verify [--policy <name>] [--base <ref>] [--require-coverage]",
    summary:
      "Check the approval log's chain, signatures and policy coverage. Offline.",
    positionals: 0,
    flags: {
      policy: { type: "string", help: "Check only this policy." },
      base: {
        type: "string",
        help: "Git ref; check that the log only grew since it.",
      },
      "require-coverage": {
        type: "boolean",
        help: "Fail if a policy file has no logged approval.",
      },
    },
    env: [],
    example: "parmana log verify --require-coverage",
  },
  {
    id: "log export",
    usage: "parmana log export [--policy <name>]",
    summary:
      "Append approvals from the database that the log does not hold yet.",
    positionals: 0,
    flags: { policy: { type: "string", help: "Export only this policy." } },
    env: ["CI_DATABASE_URL"],
    example: "parmana log export --policy customer-refund",
  },
  {
    id: "log check-db",
    usage: "parmana log check-db [--policy <name>]",
    summary: "Compare the log with the database without writing.",
    positionals: 0,
    flags: { policy: { type: "string", help: "Check only this policy." } },
    env: ["CI_DATABASE_URL"],
    example: "parmana log check-db",
  },
  {
    id: "completion",
    usage: "parmana completion <bash|powershell>",
    summary: "Print a shell completion script.",
    positionals: 1,
    flags: {},
    env: [],
    example: "parmana completion powershell | Out-String | Invoke-Expression",
  },
];

export function findCommand(id: string): CommandSpec | undefined {
  return COMMANDS.find((command) => command.id === id);
}

/** Every flag any command or the globals use, for a single lenient parse. */
export function allFlags(): Readonly<Record<string, FlagSpec>> {
  const merged: Record<string, FlagSpec> = { ...GLOBAL_FLAGS };
  for (const command of COMMANDS) {
    for (const [name, flag] of Object.entries(command.flags)) {
      merged[name] = flag;
    }
  }
  return merged;
}

/** Help for one command, or for the whole tool when no command is named. */
export function renderHelp(commandId: string | undefined): string {
  if (commandId === undefined) {
    const groups = COMMANDS.map(
      (command) => `  ${command.id.padEnd(18)} ${command.summary}`,
    ).join("\n");
    return [
      "parmana: policy governance from the command line",
      "",
      "Usage: parmana <command> [options]",
      "",
      "Commands:",
      groups,
      "",
      "Run 'parmana <command> --help' for a command's options and an example.",
      "Set PARMANA_TOKEN to your bearer token. It is read from the environment only.",
      "",
    ].join("\n");
  }
  const command = findCommand(commandId);
  if (command === undefined) {
    return renderHelp(undefined);
  }
  const flagLines = Object.entries(command.flags).map(
    ([name, flag]) =>
      `  --${name}${flag.type === "string" ? " <value>" : ""}`.padEnd(30) +
      flag.help,
  );
  const globalLines = Object.entries(GLOBAL_FLAGS).map(
    ([name, flag]) =>
      `  --${name}${flag.type === "string" ? " <value>" : ""}`.padEnd(30) +
      flag.help,
  );
  const envLines =
    command.env.length > 0
      ? ["", "Environment:", ...command.env.map((name) => `  ${name}`)]
      : [];
  return [
    command.summary,
    "",
    `Usage: ${command.usage}`,
    "",
    "Options:",
    ...(flagLines.length > 0 ? flagLines : ["  (none)"]),
    "",
    "Global options:",
    ...globalLines,
    ...envLines,
    "",
    "Example:",
    `  ${command.example}`,
    "",
  ].join("\n");
}
