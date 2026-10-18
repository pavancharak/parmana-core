import {
  parseApiKeys,
  parseCryptoMode,
  parseStorageProvider,
} from "@parmana/shared";

//
// Config validation in this codebase fails closed: an invalid value
// for a config variable is rejected at config-LOAD time with a named
// error identifying exactly which variable and value were wrong --
// never silently defaulted, and never left to surface later as an
// opaque runtime failure deep inside whatever code path first needed
// the (invalid) value.
//
console.log();
console.log("==================================================");
console.log("Tutorial 80 - Fail-Closed Config Validation");
console.log("==================================================");
console.log();

console.log("CRYPTO_MODE");
console.log("--------------------------------------------------");
console.log(
  `parseCryptoMode(undefined) -> ${parseCryptoMode(undefined)} (default)`,
);
console.log(`parseCryptoMode("hybrid")  -> ${parseCryptoMode("hybrid")}`);

let cryptoModeError: string | undefined;
try {
  parseCryptoMode("quantum");
} catch (error) {
  cryptoModeError = error instanceof Error ? error.message : String(error);
}
console.log(`parseCryptoMode("quantum") -> throws: ${cryptoModeError}`);
console.log();

console.log("PARMANA_STORAGE");
console.log("--------------------------------------------------");
console.log(
  `parseStorageProvider(undefined)  -> ${parseStorageProvider(undefined)} (default)`,
);
console.log(
  `parseStorageProvider("supabase") -> ${parseStorageProvider("supabase")}`,
);

let storageError: string | undefined;
try {
  parseStorageProvider("sqlite");
} catch (error) {
  storageError = error instanceof Error ? error.message : String(error);
}
console.log(`parseStorageProvider("sqlite")   -> throws: ${storageError}`);

// A retired env var name is caught by name too, not just an unknown value.
process.env.DATABASE_PROVIDER = "supabase";
let retiredVarError: string | undefined;
try {
  parseStorageProvider("memory");
} catch (error) {
  retiredVarError = error instanceof Error ? error.message : String(error);
}
delete process.env.DATABASE_PROVIDER;
console.log(`DATABASE_PROVIDER set (retired)  -> throws: ${retiredVarError}`);
console.log();

console.log("PARMANA_API_KEYS");
console.log("--------------------------------------------------");
console.log(
  `parseApiKeys(undefined) -> ${JSON.stringify(parseApiKeys(undefined))}`,
);

let jsonError: string | undefined;
try {
  parseApiKeys("not json");
} catch (error) {
  jsonError = error instanceof Error ? error.message : String(error);
}
console.log(`parseApiKeys("not json") -> throws: ${jsonError}`);

let missingFieldError: string | undefined;
try {
  parseApiKeys(JSON.stringify([{ keyHash: "a".repeat(64) }]));
} catch (error) {
  missingFieldError = error instanceof Error ? error.message : String(error);
}
console.log(
  `parseApiKeys([{keyHash only, no callerId}]) -> throws: ${missingFieldError}`,
);
console.log();

const allPassed =
  parseCryptoMode(undefined) === "single" &&
  cryptoModeError?.includes("quantum") === true &&
  parseStorageProvider(undefined) === "memory" &&
  storageError?.includes("sqlite") === true &&
  retiredVarError?.includes("PARMANA_STORAGE") === true &&
  jsonError !== undefined &&
  missingFieldError !== undefined;

if (allPassed) {
  console.log(
    "✓ Every invalid config value is rejected at load time with a named, specific error -- none of them silently default or crash later.",
  );
} else {
  console.log(
    "✗ Expected every invalid value above to throw a named error, and valid/default values to resolve cleanly.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 81 - Connector Execution Gateway");
