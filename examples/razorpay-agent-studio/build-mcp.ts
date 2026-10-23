/**
 * Builds the Agent Studio MCP server (mcp.ts) into a folder Vercel can
 * deploy as it is: api/mcp.mjs with the SDK bundled in, a package.json and
 * a vercel.json. No secret is written into the build: the bearer token and
 * Parmana's agent key are Vercel environment variables.
 *
 *   npx tsx examples/razorpay-agent-studio/build-mcp.ts --out ../parmana-agent-studio-mcp
 *
 * Run `npm run build` first, so the SDK in typescript/dist is current.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];

  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

async function main(): Promise<void> {
  const out = path.resolve(argument("--out"));
  const here = path.dirname(fileURLToPath(import.meta.url));

  mkdirSync(path.join(out, "api"), { recursive: true });

  await build({
    entryPoints: [path.join(here, "mcp.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: path.join(out, "api", "mcp.mjs"),
    // The shared tsconfig is per folder; the bundle needs none of it.
    tsconfigRaw: {},
    logLevel: "warning",
  });

  writeFileSync(
    path.join(out, "package.json"),
    `${JSON.stringify({ name: path.basename(out), private: true, type: "module" }, null, 2)}\n`,
  );

  // A propose_refund call waits for Parmana, which took 24 to 32 seconds
  // for an approved request (G-84). maxDuration needs a plan that allows it.
  writeFileSync(
    path.join(out, "vercel.json"),
    `${JSON.stringify({ functions: { "api/mcp.mjs": { maxDuration: 60 } } }, null, 2)}\n`,
  );

  console.log(`Built ${path.join(out, "api", "mcp.mjs")}`);
  console.log(
    "Then, from inside that folder: add AGENT_STUDIO_TOKEN, PARMANA_URL and PARMANA_API_KEY as sensitive variables, and deploy.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
