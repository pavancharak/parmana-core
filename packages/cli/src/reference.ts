import {
  COMMANDS,
  GLOBAL_FLAGS,
  type CommandSpec,
  type FlagSpec,
} from "./spec.js";

/**
 * Renders the reference page from the command table. The page is committed to
 * docs/site/cli/reference.mdx, and a test fails if the two differ, so the
 * reference cannot fall behind the commands.
 */

function flagRow(name: string, flag: FlagSpec): string {
  const value = flag.type === "string" ? " `<value>`" : "";
  return `| \`--${name}\`${value} | ${flag.help} |`;
}

function commandSection(command: CommandSpec): string {
  const flags = Object.entries(command.flags);
  const flagTable =
    flags.length === 0
      ? "This command takes no options of its own."
      : [
          "| Option | Meaning |",
          "| --- | --- |",
          ...flags.map(([name, flag]) => flagRow(name, flag)),
        ].join("\n");
  const env =
    command.env.length === 0
      ? "This command reads no environment variables."
      : command.env.map((name) => `- \`${name}\``).join("\n");
  return [
    `## \`${command.id}\``,
    "",
    command.summary,
    "",
    "```bash",
    command.usage,
    "```",
    "",
    "### Options",
    "",
    flagTable,
    "",
    "### Environment",
    "",
    env,
    "",
    "### Example",
    "",
    "```bash",
    command.example,
    "```",
    "",
  ].join("\n");
}

export function renderReference(): string {
  const globals = Object.entries(GLOBAL_FLAGS).map(([name, flag]) =>
    flagRow(name, flag),
  );
  const index = COMMANDS.map(
    (command) => `- [\`${command.id}\`](#${command.id.replace(/ /g, "-")})`,
  ).join("\n");
  return [
    "---",
    'title: "Command reference"',
    'description: "Every parmana command, its options, environment variables and examples. Generated from the command table in the CLI source."',
    "---",
    "",
    "This page is generated from the CLI's command table. Do not edit it by hand; run `npm run generate:cli-reference` after changing a command.",
    "",
    "## Global options",
    "",
    "These work with every command.",
    "",
    "| Option | Meaning |",
    "| --- | --- |",
    ...globals,
    "",
    "## Commands",
    "",
    index,
    "",
    ...COMMANDS.map(commandSection),
    "## Exit codes",
    "",
    "| Code | Meaning |",
    "| --- | --- |",
    "| 0 | Success. |",
    "| 1 | The server, the network or a script reported a failure. |",
    "| 2 | A usage error: a missing or unknown option, a bad value, or a file that does not match. |",
    "",
  ].join("\n");
}
