import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The built command, as npm links it. The bin name is `parmana-ops`, which
// the old entry-point check did not recognise, so the command printed nothing.
const cliEntry = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "index.js",
);

describe("parmana-ops entry point", () => {
  it("prints its usage when started through a symlink with a different name", () => {
    const dir = mkdtempSync(join(tmpdir(), "parmana-ops-bin-"));
    try {
      const bin = join(dir, "parmana-ops");
      symlinkSync(cliEntry, bin);
      const out = execFileSync(process.execPath, [bin, "--help"], {
        encoding: "utf8",
      });
      expect(out).toContain("Usage: parmana-ops");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not run its command when the module is imported", async () => {
    const mod = await import(cliEntry);
    expect(typeof mod).toBe("object");
  });
});
