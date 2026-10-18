// Copies the policies shipped in the image (./policies) into the `policies`
// table, for a new self hosted database.
//
// In production the API reads policies from Postgres, not from disk
// (packages/api/src/application.ts), so an empty table would refuse every
// request with a missing policy. This only inserts a policy version that is
// not in the table yet. It never overwrites a row, so a policy changed
// through policy governance is kept on every later start.

import { FilePolicyRepository } from "@parmana/policy";
import pg from "pg";

const policyDir = process.env.PARMANA_POLICY_DIR ?? "./policies";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const files = new FilePolicyRepository(policyDir);
  const policies = await files.listAll();

  let inserted = 0;

  for (const { name, version } of policies) {
    const content = await files.load(name, version);
    const result = await pool.query(
      `INSERT INTO policies (policy_name, policy_version, content_json, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (policy_name, policy_version) DO NOTHING`,
      [name, version, JSON.stringify(content)],
    );
    inserted += result.rowCount ?? 0;
  }

  console.log(
    `[seed-policies] ${policies.length} policies in the image, ${inserted} ` +
      `added, ${policies.length - inserted} already present and kept`,
  );
} finally {
  await pool.end();
}
