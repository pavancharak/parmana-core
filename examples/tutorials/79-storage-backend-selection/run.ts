import {
  StorageFactory,
  MemoryStorageProvider,
  SupabaseStorageProvider,
} from "@parmana/storage";

//
// G-15: StorageFactory.createFromEnvironment() decides between an
// in-memory backend and a real Supabase-backed one purely from
// environment variables -- and, critically, must NEVER construct a
// live Supabase client under NODE_ENV=test, no matter what
// PARMANA_STORAGE says. This tutorial exercises the real decision
// function against every combination, without ever touching a live
// database (SupabaseStorageProvider's constructor only needs a
// syntactically valid DATABASE_URL to succeed -- no live connection is
// opened until something actually queries it, which this tutorial
// never does).
//
const ENV_KEYS = ["NODE_ENV", "PARMANA_STORAGE", "DATABASE_URL"] as const;
const savedEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

function resetEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

console.log();
console.log("==================================================");
console.log("Tutorial 79 - Storage Backend Selection");
console.log("==================================================");
console.log();

try {
  console.log(
    "Scenario 1: NODE_ENV=test, PARMANA_STORAGE=supabase -- test safety wins regardless",
  );
  console.log("--------------------------------------------------");
  resetEnv();
  process.env.NODE_ENV = "test";
  process.env.PARMANA_STORAGE = "supabase";
  const provider1 = StorageFactory.createFromEnvironment();
  console.log(`Provider : ${provider1.constructor.name}`);
  console.log();

  console.log(
    "Scenario 2: NODE_ENV=test, PARMANA_STORAGE=supabase, DATABASE_URL present -- still memory",
  );
  console.log("--------------------------------------------------");
  resetEnv();
  process.env.NODE_ENV = "test";
  process.env.PARMANA_STORAGE = "supabase";
  process.env.DATABASE_URL =
    "postgresql://user:pass@example.supabase.co:5432/postgres";
  const provider2 = StorageFactory.createFromEnvironment();
  console.log(
    `Provider : ${provider2.constructor.name} (a live DATABASE_URL is never enough on its own under NODE_ENV=test)`,
  );
  console.log();

  console.log(
    "Scenario 3: Production-like env, PARMANA_STORAGE=supabase, no DATABASE_URL -- fails closed",
  );
  console.log("--------------------------------------------------");
  resetEnv();
  process.env.NODE_ENV = "production";
  process.env.PARMANA_STORAGE = "supabase";
  let scenario3Error: string | undefined;
  try {
    StorageFactory.createFromEnvironment();
  } catch (error) {
    scenario3Error = error instanceof Error ? error.message : String(error);
  }
  console.log(`Threw : ${scenario3Error}`);
  console.log();

  console.log(
    "Scenario 4: Production-like env, PARMANA_STORAGE=supabase, DATABASE_URL configured",
  );
  console.log("--------------------------------------------------");
  resetEnv();
  process.env.NODE_ENV = "production";
  process.env.PARMANA_STORAGE = "supabase";
  process.env.DATABASE_URL =
    "postgresql://user:pass@example.supabase.co:5432/postgres";
  const provider4 = StorageFactory.createFromEnvironment();
  console.log(`Provider : ${provider4.constructor.name}`);
  console.log();

  console.log(
    "Scenario 5: Production-like env, PARMANA_STORAGE=memory -- an explicit, valid choice",
  );
  console.log("--------------------------------------------------");
  resetEnv();
  process.env.NODE_ENV = "production";
  process.env.PARMANA_STORAGE = "memory";
  const provider5 = StorageFactory.createFromEnvironment();
  console.log(`Provider : ${provider5.constructor.name}`);
  console.log();

  const allPassed =
    provider1 instanceof MemoryStorageProvider &&
    provider2 instanceof MemoryStorageProvider &&
    scenario3Error?.includes("PARMANA_STORAGE=supabase") === true &&
    scenario3Error?.includes("DATABASE_URL") === true &&
    provider4 instanceof SupabaseStorageProvider &&
    provider5 instanceof MemoryStorageProvider;

  if (allPassed) {
    console.log(
      "✓ NODE_ENV=test always wins (never a live client under test); production without DATABASE_URL fails closed by name, not a generic crash.",
    );
  } else {
    console.log(
      "✗ Expected the test-safety override, the fail-closed error, and both explicit production choices to all hold.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 80 - Fail-Closed Config Validation");
} finally {
  resetEnv();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
  }
}
