/**
 * Builds the live check signal source (endpoint.ts) into a folder Vercel
 * can deploy as it is: api/signals.mjs, with example 08's handler bundled
 * in and three public values written in, and a package.json.
 *
 *   npx tsx examples/live-checks/business-signal-source/build-endpoint.ts \
 *     --parmana-url https://parmana-api-real.vercel.app \
 *     --endpoint-url https://parmana-signal-check.vercel.app/api/signals \
 *     --key-id livecheck-erp-1 \
 *     --out ../parmana-signal-check
 *
 * It reads Parmana's public key from GET {parmana-url}/keys/default.
 * --endpoint-url must be the address the source is registered under,
 * exactly: a query made for any other address is refused. --key-id is
 * the keyId registered with the source's public key.
 *
 * The private key is never written into the bundle. Set it on the Vercel
 * project as the sensitive environment variable SOURCE_PRIVATE_KEY_PEM
 * (README.md, stage 1).
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
  const parmanaUrl = argument("--parmana-url").replace(/\/+$/, "");
  const endpointUrl = argument("--endpoint-url");
  const keyId = argument("--key-id");
  const out = path.resolve(argument("--out"));

  if (!endpointUrl.startsWith("https://")) {
    throw new Error(
      "--endpoint-url must be https: Parmana asks only https sources.",
    );
  }

  const keyResponse = await fetch(`${parmanaUrl}/keys/default`);

  if (!keyResponse.ok) {
    throw new Error(
      `GET ${parmanaUrl}/keys/default answered ${keyResponse.status}.`,
    );
  }

  const { pem } = (await keyResponse.json()) as { pem: string };

  mkdirSync(path.join(out, "api"), { recursive: true });

  await build({
    entryPoints: [
      path.join(path.dirname(fileURLToPath(import.meta.url)), "endpoint.ts"),
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: path.join(out, "api", "signals.mjs"),
    define: {
      "process.env.PARMANA_PUBLIC_KEY_PEM": JSON.stringify(pem),
      "process.env.ENDPOINT_URL": JSON.stringify(endpointUrl),
      "process.env.SOURCE_KEY_ID": JSON.stringify(keyId),
    },
    // examples/tsconfig.json extends a file that does not exist; the
    // bundle needs no settings from it.
    tsconfigRaw: {},
    logLevel: "warning",
  });

  // Its own vercel.json: without one, a deploy can pick up the settings
  // of the repository's vercel.json (a function api/index.ts) and fail.
  writeFileSync(
    path.join(out, "vercel.json"),
    `${JSON.stringify({ functions: { "api/signals.mjs": { maxDuration: 10 } } }, null, 2)}\n`,
  );

  writeFileSync(
    path.join(out, "package.json"),
    `${JSON.stringify({ name: path.basename(out), private: true, type: "module" }, null, 2)}\n`,
  );

  console.log(`Built ${path.join(out, "api", "signals.mjs")}`);
  console.log(`Audience: ${endpointUrl}`);
  console.log(`Key id:   ${keyId}`);
  console.log(
    `Set SOURCE_PRIVATE_KEY_PEM on the Vercel project, then deploy from inside ${out}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
