import { generateKeyPairSync } from "node:crypto";
import { vi } from "vitest";
import { describe, expect, it } from "vitest";

import {
  runCommand,
  type ParsedCommand,
  type Runtime,
  type Settings,
  STEP_UP_TTL_SECONDS,
} from "../src/commands.js";
import { CliUsageError } from "../src/errors.js";

const PENDING_ID = "00000000-0000-4000-8000-000000000001";
const POLICY = JSON.stringify({
  policyId: "customer-refund",
  policyVersion: "1.3.0",
  rules: [],
});

const SETTINGS: Settings = {
  format: "text",
  dryRun: false,
  verbose: false,
  timeoutMs: 5000,
  flagProfile: undefined,
  flagApiUrl: undefined,
};

interface Fake {
  readonly runtime: Runtime;
  readonly files: Map<string, string>;
  readonly written: Map<string, string>;
  readonly fetchMock: ReturnType<typeof vi.fn>;
  readonly scripts: string[][];
}

function fakeRuntime(options: {
  responses?: Response[];
  files?: Record<string, string>;
  env?: Record<string, string>;
}): Fake {
  const files = new Map(Object.entries(options.files ?? {}));
  const written = new Map<string, string>();
  const scripts: string[][] = [];
  const queue = [...(options.responses ?? [])];
  const fetchMock = vi.fn(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("unexpected request");
    return next;
  });
  return {
    files,
    written,
    fetchMock,
    scripts,
    runtime: {
      env: { PARMANA_TOKEN: "test-token", ...(options.env ?? {}) },
      homeDir: "/nowhere",
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => undefined,
      log: () => undefined,
      readText: (path) => files.get(path),
      writeText: (path, text) => {
        written.set(path, text);
      },
      fileExists: () => false,
      ensureDirectory: () => undefined,
      writeKeyFile: () => undefined,
      findLogScript: () => "/repo/scripts/policy-approval-log.ts",
      runScript: (_script, args) => {
        scripts.push([...args]);
        return 0;
      },
    },
  };
}

function parsed(
  id: string,
  args: string[] = [],
  values: Record<string, string | boolean | undefined> = {},
): ParsedCommand {
  return { id, args, values };
}

describe("policy status", () => {
  it("lists only the matching pending change, sent with the token", async () => {
    const body = JSON.stringify({
      changes: [
        {
          pendingPolicyChangeId: PENDING_ID,
          policyName: "customer-refund",
          policyVersion: "1.3.0",
          status: "PENDING_APPROVAL",
          proposedBy: "maker",
          proposedAt: "t",
        },
        {
          pendingPolicyChangeId: "other",
          policyName: "razorpay-refund",
          policyVersion: "1.0.0",
          status: "PENDING_APPROVAL",
          proposedBy: "x",
          proposedAt: "t",
        },
      ],
    });
    const fake = fakeRuntime({
      responses: [new Response(body, { status: 200 })],
    });

    const result = await runCommand(
      parsed("policy status", ["customer-refund", "1.3.0"]),
      SETTINGS,
      fake.runtime,
    );

    expect(result.code).toBe(0);
    expect(result.text).toContain(PENDING_ID);
    expect(result.text).not.toContain("razorpay-refund");
    const [url, init] = fake.fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://parmana-api-real.vercel.app/policies/pending-changes?status=PENDING_APPROVAL",
    );
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test-token",
    );
  });

  it("returns the hint for a server refusal, with the code and no token", async () => {
    const fake = fakeRuntime({
      responses: [
        new Response(
          '{"error":"forbidden","code":"CHECKER_NOT_IN_SCOPE","message":"not listed"}',
          { status: 403 },
        ),
      ],
    });
    const result = await runCommand(
      parsed("policy status", ["customer-refund", "1.3.0"]),
      SETTINGS,
      fake.runtime,
    );
    expect(result.code).toBe(1);
    expect(result.text).toContain("HTTP 403 CHECKER_NOT_IN_SCOPE");
    expect(result.text).toContain("Hint: The checker is not listed");
    expect(result.text).not.toContain("test-token");
  });

  it("requires PARMANA_TOKEN for a real request", async () => {
    const fake = fakeRuntime({ env: { PARMANA_TOKEN: "" } });
    await expect(
      runCommand(parsed("policy status", ["a", "1"]), SETTINGS, fake.runtime),
    ).rejects.toThrow(CliUsageError);
    expect(fake.fetchMock).not.toHaveBeenCalled();
  });
});

describe("policy propose", () => {
  const args = ["policy.json"];
  const values = {
    name: "customer-refund",
    version: "1.3.0",
    reason: "Refuse all refunds",
  };

  it("sends the whole policy and the reason to the versioned path", async () => {
    const fake = fakeRuntime({
      files: { "policy.json": POLICY },
      responses: [
        new Response('{"pendingPolicyChangeId":"x"}', { status: 201 }),
      ],
    });
    const result = await runCommand(
      parsed("policy propose", args, values),
      SETTINGS,
      fake.runtime,
    );
    expect(result.code).toBe(0);
    const [url, init] = fake.fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://parmana-api-real.vercel.app/policies/customer-refund/1.3.0/pending-changes",
    );
    const sent = JSON.parse(String(init.body)) as {
      proposedContent: { policyId: string };
      reason: string;
    };
    expect(sent.proposedContent.policyId).toBe("customer-refund");
    expect(sent.reason).toBe("Refuse all refunds");
  });

  it("dry run prints the request and sends nothing, even without a token", async () => {
    const fake = fakeRuntime({
      files: { "policy.json": POLICY },
      env: { PARMANA_TOKEN: "" },
    });
    const result = await runCommand(
      parsed("policy propose", args, values),
      { ...SETTINGS, dryRun: true },
      fake.runtime,
    );
    expect(result.code).toBe(0);
    expect(result.text).toContain("Dry run. Nothing was sent.");
    expect(result.text).toContain(
      "POST https://parmana-api-real.vercel.app/policies/customer-refund/1.3.0/pending-changes",
    );
    expect(result.text).toContain("Authorization: Bearer ***");
    expect(fake.fetchMock).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ dryRun: true, method: "POST" });
  });

  it("refuses a mismatched name before any request is sent", async () => {
    const fake = fakeRuntime({ files: { "policy.json": POLICY } });
    await expect(
      runCommand(
        parsed("policy propose", args, { ...values, name: "razorpay-refund" }),
        SETTINGS,
        fake.runtime,
      ),
    ).rejects.toThrow(/policyId/);
    expect(fake.fetchMock).not.toHaveBeenCalled();
  });

  it("reports a conflict with the next step", async () => {
    const fake = fakeRuntime({
      files: { "policy.json": POLICY },
      responses: [
        new Response(
          '{"error":"A PENDING_APPROVAL change already exists","code":"CONFLICT"}',
          { status: 409 },
        ),
      ],
    });
    const result = await runCommand(
      parsed("policy propose", args, values),
      SETTINGS,
      fake.runtime,
    );
    expect(result.code).toBe(1);
    expect(result.text).toContain(
      "Hint: A change for this policy version is already pending",
    );
  });
});

describe("approval sign", () => {
  it("writes a signed envelope that names the change, the action and a 120 second window", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const fake = fakeRuntime({ files: { "checker.pem": pem } });

    const result = await runCommand(
      parsed("approval sign", [], {
        "key-file": "checker.pem",
        "key-id": "mamta-checker",
        pending: PENDING_ID,
        action: "approve",
        out: "envelope.json",
      }),
      SETTINGS,
      fake.runtime,
    );

    expect(result.code).toBe(0);
    const envelope = JSON.parse(fake.written.get("envelope.json") ?? "{}") as {
      payload: {
        pendingPolicyChangeId: string;
        action: string;
        authorizedAt: string;
        expiresAt: string;
      };
      keyId: string;
      signature: string;
    };
    expect(envelope.payload.pendingPolicyChangeId).toBe(PENDING_ID);
    expect(envelope.payload.action).toBe("approve");
    expect(envelope.keyId).toBe("mamta-checker");
    expect(
      Date.parse(envelope.payload.expiresAt) -
        Date.parse(envelope.payload.authorizedAt),
    ).toBe(STEP_UP_TTL_SECONDS * 1000);
  });

  it("refuses an unknown action before reading the key", async () => {
    const fake = fakeRuntime({});
    await expect(
      runCommand(
        parsed("approval sign", [], {
          "key-file": "k.pem",
          "key-id": "a",
          pending: PENDING_ID,
          action: "delete",
        }),
        SETTINGS,
        fake.runtime,
      ),
    ).rejects.toThrow(/must be "approve" or "reject"/);
  });
});

describe("approval submit", () => {
  const envelope = JSON.stringify({
    payload: { version: 1 },
    signature: "sig123",
    keyId: "mamta-checker",
    algorithm: "ed25519",
  });

  it("posts the wrapped envelope to the approve path", async () => {
    const fake = fakeRuntime({
      files: { "envelope.json": envelope },
      responses: [new Response('{"status":"APPROVED"}', { status: 200 })],
    });
    const result = await runCommand(
      parsed("approval submit", [], {
        pending: PENDING_ID,
        action: "approve",
        envelope: "envelope.json",
      }),
      SETTINGS,
      fake.runtime,
    );
    expect(result.code).toBe(0);
    expect(result.text).toContain("Approved");
    const [url, init] = fake.fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url.endsWith(`/${PENDING_ID}/approve`)).toBe(true);
    expect(JSON.parse(String(init.body))).toEqual({
      stepUpAuthorization: JSON.parse(envelope),
    });
  });

  it("dry run shows the signature masked", async () => {
    const fake = fakeRuntime({
      files: { "envelope.json": envelope },
      env: { PARMANA_TOKEN: "" },
    });
    const result = await runCommand(
      parsed("approval submit", [], {
        pending: PENDING_ID,
        action: "reject",
        envelope: "envelope.json",
      }),
      { ...SETTINGS, dryRun: true },
      fake.runtime,
    );
    expect(result.text).toContain("/reject");
    expect(result.text).toContain('"signature":"***"');
    expect(result.text).not.toContain("sig123");
    expect(fake.fetchMock).not.toHaveBeenCalled();
  });

  it("explains a refused checker", async () => {
    const fake = fakeRuntime({
      files: { "envelope.json": envelope },
      responses: [
        new Response('{"error":"CHECKER_NOT_IN_SCOPE"}', { status: 403 }),
      ],
    });
    const result = await runCommand(
      parsed("approval submit", [], {
        pending: PENDING_ID,
        action: "approve",
        envelope: "envelope.json",
      }),
      SETTINGS,
      fake.runtime,
    );
    expect(result.code).toBe(1);
    expect(result.text).toContain("CHECKER_NOT_IN_SCOPE");
    expect(result.text).toContain("POLICY_CHANGE_CHECKERS");
  });
});

describe("log commands", () => {
  it("passes the policy and coverage flags to the approval-log script", async () => {
    const fake = fakeRuntime({});
    const result = await runCommand(
      parsed("log verify", [], {
        policy: "customer-refund",
        "require-coverage": true,
      }),
      SETTINGS,
      fake.runtime,
    );
    expect(result.code).toBe(0);
    expect(fake.scripts[0]).toEqual([
      "verify",
      "--policy",
      "customer-refund",
      "--require-coverage",
    ]);
  });
});

describe("completion", () => {
  it("prints a bash script that names every group", async () => {
    const fake = fakeRuntime({});
    const result = await runCommand(
      parsed("completion", ["bash"]),
      SETTINGS,
      fake.runtime,
    );
    expect(result.text).toContain("complete -F _parmana_complete parmana");
    expect(result.text).toContain("policy");
    expect(result.text).toContain("check-db");
  });

  it("prints a PowerShell script with the same commands", async () => {
    const fake = fakeRuntime({});
    const result = await runCommand(
      parsed("completion", ["powershell"]),
      SETTINGS,
      fake.runtime,
    );
    expect(result.text).toContain(
      "Register-ArgumentCompleter -Native -CommandName parmana",
    );
    expect(result.text).toContain("'approval sign'");
  });

  it("refuses an unknown shell", async () => {
    const fake = fakeRuntime({});
    await expect(
      runCommand(parsed("completion", ["fish"]), SETTINGS, fake.runtime),
    ).rejects.toThrow(CliUsageError);
  });
});

describe("findUpward", () => {
  it("finds a file in an ancestor folder and returns undefined when none exists", async () => {
    const { findUpward } = await import("../src/commands.js");
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } =
      await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "parmana-up-"));
    try {
      mkdirSync(join(root, "scripts"));
      writeFileSync(join(root, "scripts", "x.ts"), "");
      const deep = join(root, "a", "b");
      mkdirSync(deep, { recursive: true });
      expect(findUpward(deep, join("scripts", "x.ts"))).toBe(
        join(root, "scripts", "x.ts"),
      );
      expect(findUpward(deep, join("scripts", "missing.ts"))).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
