import { COMMANDS, GLOBAL_FLAGS, type CommandSpec } from "./spec.js";

export type ShellName = "bash" | "powershell";

interface Groups {
  readonly groups: readonly string[];
  readonly subcommands: Readonly<Record<string, readonly string[]>>;
}

/** The top-level words and the words after each one, read from the command table. */
function groupsOf(): Groups {
  const subcommands: Record<string, string[]> = {};
  for (const command of COMMANDS) {
    const [group, ...rest] = command.id.split(" ");
    if (group === undefined) continue;
    const word = rest.join(" ");
    if (word === "") {
      subcommands[group] = subcommands[group] ?? [];
    } else {
      subcommands[group] = [...(subcommands[group] ?? []), word];
    }
  }
  return { groups: Object.keys(subcommands), subcommands };
}

/** Every flag the command takes, plus the global flags. */
function flagsOf(command: CommandSpec): string[] {
  return [...Object.keys(command.flags), ...Object.keys(GLOBAL_FLAGS)].map(
    (name) => `--${name}`,
  );
}

function bashCase(): string {
  const { subcommands } = groupsOf();
  const lines = Object.entries(subcommands).map(([group, words]) => {
    const list = words.length > 0 ? words.join(" ") : "";
    return `    ${group}) words="${list}" ;;`;
  });
  const flagLines = COMMANDS.map(
    (command) =>
      `    "${command.id}") flags="${flagsOf(command).join(" ")}" ;;`,
  );
  return [
    "_parmana_complete() {",
    '  local cur="${COMP_WORDS[COMP_CWORD]}" words="" flags=""',
    '  if [ "$COMP_CWORD" -eq 1 ]; then',
    `    COMPREPLY=( $(compgen -W "${groupsOf().groups.join(" ")} help completion" -- "$cur") )`,
    "    return",
    "  fi",
    '  if [ "$COMP_CWORD" -eq 2 ]; then',
    '    case "${COMP_WORDS[1]}" in',
    ...lines,
    "    esac",
    '    COMPREPLY=( $(compgen -W "$words" -- "$cur") )',
    "    return",
    "  fi",
    '  case "${COMP_WORDS[1]} ${COMP_WORDS[2]}" in',
    ...flagLines,
    "  esac",
    '  COMPREPLY=( $(compgen -W "$flags" -- "$cur") )',
    "}",
    "complete -F _parmana_complete parmana",
    "",
  ].join("\n");
}

function psHashtable(entries: readonly [string, readonly string[]][]): string {
  return entries
    .map(
      ([key, values]) =>
        `  '${key}' = @(${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ")})`,
    )
    .join("\n");
}

function powershellScript(): string {
  const { groups, subcommands } = groupsOf();
  const flagEntries = COMMANDS.map((command): [string, string[]] => [
    command.id,
    flagsOf(command),
  ]);
  return [
    "Register-ArgumentCompleter -Native -CommandName parmana -ScriptBlock {",
    "  param($wordToComplete, $commandAst, $cursorPosition)",
    "  $tokens = @($commandAst.CommandElements | ForEach-Object { $_.ToString() })",
    `  $groups = @(${groups.map((g) => `'${g}'`).join(", ")}, 'help', 'completion')`,
    "  $subcommands = @{",
    psHashtable(Object.entries(subcommands)),
    "  }",
    "  $flags = @{",
    psHashtable(flagEntries),
    "  }",
    "  if ($tokens.Count -le 2) {",
    "    if ($tokens.Count -le 1) { $candidates = $groups } else { $candidates = $subcommands[$tokens[1]] }",
    "  } else {",
    '    $candidates = $flags["$($tokens[1]) $($tokens[2])"]',
    "  }",
    '  $candidates | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {',
    "    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)",
    "  }",
    "}",
    "",
  ].join("\n");
}

/** A completion script for the given shell. Generated from the command table. */
export function renderCompletion(shell: ShellName): string {
  return shell === "bash" ? bashCase() : powershellScript();
}
