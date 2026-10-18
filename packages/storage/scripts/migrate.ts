import path from "node:path";
import { readdir, readFile } from "node:fs/promises";

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  throw new Error("SUPABASE_URL is not configured.");
}

if (!key) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
}

const client = createClient(url, key);

const schemaDirectory = path.resolve(process.cwd(), "schemas");

async function migrate(): Promise<void> {
  const files = (await readdir(schemaDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migration(s).\n`);

  for (const file of files) {
    console.log(`Running ${file}...`);

    const sql = await readFile(path.join(schemaDirectory, file), "utf8");

    const { error } = await client.rpc("exec_sql", {
      sql,
    });

    if (error) {
      throw error;
    }

    console.log(`✓ ${file}`);
  }

  console.log("\nAll migrations completed successfully.");
}

migrate().catch((error) => {
  console.error(error);

  process.exit(1);
});
