#!/usr/bin/env node
import { parseArgs } from "node:util";

import { CliError, CliUsageError } from "./errors.js";
import { redactText } from "./redact.js";
import {
  runCommand,
  defaultRuntime,
  type Runtime,
  type Settings,
} from "./commands.js";
import {
  allFlags,
  findCommand,
  GLOBAL_FLAGS,
  renderHelp,
  type FlagSpec,
  COMMANDS,
} from "./spec.js";

export interface Io {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export interface MainDeps {
  readonly runtime: Runtime;
  readonly io: Io;
}

const DEFAULT_TIMEOUT_SECONDS = 30;

/** The first word of every command, plus the built-in help and completion words. */
const KNOWN_GROUPS = new Set<string>([
  "help",
  "completion",
  ...COMMANDS.map((command) => command.id.split(" ")[0] ?? ""),
]);

function parseOptionsSpec(
  flags: Readonly<Record<string, FlagSpec>>,
): Record<string, { type: "string" | "boolean" }> {
  const options: Record<string, { type: "string" | "boolean" }> = {};
  for (const [name, flag] of Object.entries(flags)) {
    options[name] = { type: flag.type };
  }
  return options;
}

function settingsFrom(
  values: Record<string, string | boolean | undefined>,
): Settings {
  const format = values["output"] ?? "text";
  if (format !== "text" && format !== "json") {
    throw new CliUsageError('--output must be "text" or "json".');
  }
  const seconds =
    values["timeout"] === undefined
      ? DEFAULT_TIMEOUT_SECONDS
      : Number(values["timeout"]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new CliUsageError("--timeout must be a positive number of seconds.");
  }
  return {
    format,
    dryRun: values["dry-run"] === true,
    verbose: values["verbose"] === true,
    timeoutMs: Math.round(seconds * 1000),
    flagProfile:
      typeof values["profile"] === "string" ? values["profile"] : undefined,
    flagApiUrl:
      typeof values["api-url"] === "string" ? values["api-url"] : undefined,
  };
}

/** Reports a failure in the requested format and returns its exit code. */
function report(
  error: unknown,
  format: "text" | "json",
  deps: MainDeps,
): number {
  const exitCode = error instanceof CliError ? error.exitCode : 1;
  const token = deps.runtime.env["PARMANA_TOKEN"];
  const message = redactText(
    error instanceof Error ? error.message : String(error),
    token ? [token] : [],
  );
  if (format === "json") {
    deps.io.stdout(
      `${JSON.stringify({ error: { message, exitCode } }, null, 2)}\n`,
    );
  } else {
    deps.io.stderr(`${message}\n`);
  }
  return exitCode;
}

/**
 * Runs the CLI. Returns the exit code instead of setting it, so tests can call it
 * and read the result. Exit codes: 0 success, 1 failure reported by the server or a
 * script, 2 usage error.
 */
export async function main(
  argv: readonly string[],
  deps: MainDeps,
): Promise<number> {
  let format: "text" | "json" = "text";
  try {
    let parsed;
    try {
      parsed = parseArgs({
        args: [...argv],
        options: parseOptionsSpec(allFlags()),
        allowPositionals: true,
        strict: true,
      });
    } catch (error) {
      throw new CliUsageError(
        `${error instanceof Error ? error.message : String(error)}. Run 'parmana --help' for the options.`,
      );
    }
    const { positionals, values } = parsed;
    const outputValue = values["output"];
    format = outputValue === "json" ? "json" : "text";

    if (
      positionals.length === 0 ||
      (values["help"] === true && positionals.length === 0)
    ) {
      deps.io.stdout(renderHelp(undefined));
      return 0;
    }
    const group = positionals[0] as string;
    if (group === "help") {
      const id = positionals.slice(1).join(" ");
      deps.io.stdout(renderHelp(id === "" ? undefined : id));
      return 0;
    }

    if (!KNOWN_GROUPS.has(group)) {
      throw new CliUsageError(
        `Unknown command "${group}". Run 'parmana --help' for the list.`,
      );
    }

    let id: string;
    let args: string[];
    if (group === "completion") {
      id = "completion";
      args = positionals.slice(1);
    } else {
      const sub = positionals[1];
      if (sub === undefined) {
        throw new CliUsageError(
          `Missing command after "${group}". Run 'parmana --help' for the list.`,
        );
      }
      id = `${group} ${sub}`;
      args = positionals.slice(2);
    }

    const spec = findCommand(id);
    if (spec === undefined) {
      throw new CliUsageError(
        `Unknown command "${id}". Run 'parmana --help' for the list.`,
      );
    }
    if (values["help"] === true) {
      deps.io.stdout(renderHelp(id));
      return 0;
    }

    for (const name of Object.keys(values)) {
      if (!(name in GLOBAL_FLAGS) && !(name in spec.flags)) {
        throw new CliUsageError(
          `--${name} is not an option of "${id}". Run 'parmana ${id} --help'.`,
        );
      }
    }
    if (args.length !== spec.positionals && id !== "completion") {
      throw new CliUsageError(`Usage: ${spec.usage}`);
    }

    const settings = settingsFrom(values);
    format = settings.format;
    const result = await runCommand(
      { id, args, values },
      settings,
      deps.runtime,
    );
    if (settings.format === "json") {
      deps.io.stdout(`${JSON.stringify(result.data, null, 2)}\n`);
    } else if (result.text.length > 0) {
      deps.io.stdout(result.text);
    }
    return result.code;
  } catch (error) {
    return report(error, format, deps);
  }
}

// Run when this file is the command itself, not when a test imports it.
if (/[\\/](index\.js|parmana)$/.test(process.argv[1] ?? "")) {
  main(process.argv.slice(2), {
    runtime: defaultRuntime(),
    io: {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
    },
  }).then((code) => {
    process.exitCode = code;
  });
}
