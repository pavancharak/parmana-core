//
// Independent verifier. Runs in a fresh process. It receives three files
// and nothing else:
//   argv[2] proof.json        the Execution Trust Record (carries the authorization)
//   argv[3] public-keys.json  keyId -> SPKI PEM public key
//   argv[4] policy-version.json  the policy name/version/contentHash the proof cites
// It imports only the built @parmana/crypto package. It reads no
// environment variables and no private key files, and makes no service calls.
// Exit code 0 = valid, 1 = invalid, 2 = usage or read error.
//
import { readFileSync } from "node:fs";
import { verifyExecutionTrustRecordOffline } from "../../packages/crypto/dist/index.js";

const [proofPath, keysPath, policyPath] = process.argv.slice(2);

if (!proofPath || !keysPath || !policyPath) {
  console.error("usage: verify-offline.mjs proof.json public-keys.json policy-version.json");
  process.exit(2);
}

let proof, publicKeys, policy;
try {
  proof = JSON.parse(readFileSync(proofPath, "utf8"));
  publicKeys = JSON.parse(readFileSync(keysPath, "utf8"));
  policy = JSON.parse(readFileSync(policyPath, "utf8"));
} catch (error) {
  console.error(`read error: ${error.message}`);
  process.exit(2);
}

const result = await verifyExecutionTrustRecordOffline(proof, publicKeys);

console.log(
  JSON.stringify({
    valid: result.valid,
    errors: result.errors,
    algorithmsChecked: result.algorithmsChecked,
    citedPolicy: `${policy.name}@${policy.version}`,
    envKeys: Object.keys(process.env).length,
  }),
);

process.exit(result.valid ? 0 : 1);
