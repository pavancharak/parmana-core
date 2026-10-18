/**
 * Builds the live check endpoint (endpoint.ts) into a folder Vercel can
 * deploy as it is: api/release.mjs, with the SDK bundled in and the two
 * public values written in, and a package.json.
 *
 *   npx tsx examples/live-checks/external-connector/build-endpoint.ts \
 *     --parmana-url https://parmana-api-real.vercel.app \
 *     --endpoint-url https://parmana-release-check.vercel.app/api/release \
 *     --out ../parmana-release-check
 *
 * It reads Parmana's public key from GET {parmana-url}/keys/default.
 * --endpoint-url must be the address the endpoint is registered under,
 * exactly: a release made for any other address is refused. Run
 * `npm run build` first, so the SDK in typescript/dist is current.
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
  const out = path.resolve(argument("--out"));

  if (!endpointUrl.startsWith("https://")) {
    throw new Error(
      "--endpoint-url must be https: Parmana releases only to https.",
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
    outfile: path.join(out, "api", "release.mjs"),
    define: {
      "process.env.PARMANA_PUBLIC_KEY_PEM": JSON.stringify(pem),
      "process.env.ENDPOINT_URL": JSON.stringify(endpointUrl),
    },
    // examples/tsconfig.json extends a file that does not exist; the
    // bundle needs no settings from it.
    tsconfigRaw: {},
    logLevel: "warning",
  });

  writeFileSync(
    path.join(out, "package.json"),
    `${JSON.stringify({ name: path.basename(out), private: true, type: "module" }, null, 2)}\n`,
  );

  console.log(`Built ${path.join(out, "api", "release.mjs")}`);
  console.log(`Audience: ${endpointUrl}`);
  console.log(`Deploy:   cd ${out}; npx vercel deploy --prod --yes`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
