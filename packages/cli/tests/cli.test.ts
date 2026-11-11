import { describe, expect, it, vi } from "vitest";

import type { Runtime } from "../src/commands.js";
import { main } from "../src/index.js";
import { renderHelp } from "../src/spec.js";

interface Captured {
  readonly stdout: string[];
  readonly stderr: string[];
}

function run(
  argv: string[],
  options: {
    env?: Record<string, string>;
    responses?: Response[];
    files?: Record<string, string>;
  } = {},
): Promise<{
  code: number;
  out: string;
  err: string;
  fetchMock: ReturnType<typeof vi.fn>;
  captured: Captured;
}> {
  const captured: Captured = { stdout: [], stderr: [] };
  const queue = [...(options.responses ?? [])];
  const fetchMock = vi.fn(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("unexpected request");
    return next;
  });
  const files = options.files ?? {};
  const runtime: Runtime = {
    env: { PARMANA_TOKEN: "test-token", ...(options.env ?? {}) },
    homeDir: "/nowhere",
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async () => undefined,
    log: () => undefined,
    readText: (path) => files[path],
    writeText: () => undefined,
    findLogScript: () => undefined,
    runScript: () => 0,
  };
  return main(argv, {
    runtime,
    io: {
      stdout: (text) => captured.stdout.push(text),
      stderr: (text) => captured.stderr.push(text),
    },
  }).then((code) => ({
    code,
    out: captured.stdout.join(""),
    err: captured.stderr.join(""),
    fetchMock,
    captured,
  }));
}

describe("help", () => {
  it("prints the command list with no arguments", async () => {
    const result = await run([]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("policy status");
    expect(result.out).toContain("approval submit");
  });

  it("prints a command's options and example with --help", async () => {
    const result = await run(["policy", "propose", "--help"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("--reason");
    expect(result.out).toContain("--dry-run");
    expect(result.out).toContain("Example:");
    expect(result.out).toContain("PARMANA_TOKEN");
  });

  it("answers help <command> the same way", async () => {
    const result = await run(["help", "approval", "sign"]);
    expect(result.out).toBe(renderHelp("approval sign"));
  });
});

describe("usage errors exit 2", () => {
  it.each([
    [["nonsense"], "Unknown command"],
    [["policy", "status"], "Usage: parmana-ops policy status"],
    [
      ["policy", "status", "a", "1", "--reason", "x"],
      "--reason is not an option",
    ],
    [
      ["policy", "status", "a", "1", "--output", "xml"],
      '--output must be "text" or "json"',
    ],
    [
      ["policy", "status", "a", "1", "--timeout=-1"],
      "--timeout must be a positive number",
    ],
    [["policy"], 'Missing command after "policy"'],
  ])("%j", async (argv, message) => {
    const result = await run(argv);
    expect(result.code).toBe(2);
    expect(result.err).toContain(message);
  });
});

describe("output formats", () => {
  it("prints the result as JSON with --output json", async () => {
    const result = await run(
      ["policy", "status", "customer-refund", "1.3.0", "--output", "json"],
      {
        responses: [new Response('{"changes":[]}', { status: 200 })],
      },
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toEqual({ changes: [] });
  });

  it("reports a usage error as JSON on stdout with --output json", async () => {
    const result = await run(["nonsense", "--output", "json"]);
    expect(result.code).toBe(2);
    const parsed = JSON.parse(result.out) as {
      error: { message: string; exitCode: number };
    };
    expect(parsed.error.exitCode).toBe(2);
    expect(parsed.error.message).toContain("Unknown command");
    expect(result.err).toBe("");
  });

  it("dry run prints the request in text and a JSON object with --output json", async () => {
    const text = await run(
      [
        "policy",
        "propose",
        "policy.json",
        "--name",
        "customer-refund",
        "--version",
        "1.3.0",
        "--reason",
        "why",
        "--dry-run",
      ],
      {
        files: {
          "policy.json": JSON.stringify({
            policyId: "customer-refund",
            policyVersion: "1.3.0",
          }),
        },
        env: { PARMANA_TOKEN: "" },
      },
    );
    expect(text.code).toBe(0);
    expect(text.out).toContain("Dry run. Nothing was sent.");

    const json = await run(
      [
        "policy",
        "propose",
        "policy.json",
        "--name",
        "customer-refund",
        "--version",
        "1.3.0",
        "--reason",
        "why",
        "--dry-run",
        "--output",
        "json",
      ],
      {
        files: {
          "policy.json": JSON.stringify({
            policyId: "customer-refund",
            policyVersion: "1.3.0",
          }),
        },
        env: { PARMANA_TOKEN: "" },
      },
    );
    expect(JSON.parse(json.out)).toMatchObject({
      dryRun: true,
      method: "POST",
    });
  });
});

describe("completion", () => {
  it("writes the script to stdout", async () => {
    const result = await run(["completion", "bash"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("complete -F _parmana_complete parmana");
  });
});

describe("secrets", () => {
  it("never prints the token, even in an error", async () => {
    const result = await run(["policy", "status", "a", "1"], {
      env: {
        PARMANA_TOKEN: "super-secret-value",
        PARMANA_API_URL: "http://example.com",
      },
    });
    expect(result.code).toBe(2);
    expect(result.err + result.out).not.toContain("super-secret-value");
  });
});
