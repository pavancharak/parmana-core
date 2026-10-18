import {
  InMemoryCredentialVault,
  InMemorySessionCredentialVault,
  RandomIdGenerator,
  SystemClock,
} from "@parmana/execution-control";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 57 - Credential Isolation");
  console.log("==================================================");
  console.log();

  //
  // Underlying enterprise credential.
  //
  // This is the ONLY place the real secret ever appears in
  // this tutorial's own code.
  //
  const credentials = new InMemoryCredentialVault();

  credentials.setCredential("sap", {
    value: Object.freeze({
      apiKey: "sap-secret-1234",
    }),
  });

  console.log("Underlying Credential Vault");

  console.log("--------------------------------------------------");

  console.log('✓ Enterprise credential stored for connector "sap".');

  console.log();

  //
  // Session Credential Vault
  //
  // Wraps the raw vault above with single-use,
  // time-bounded leases. Nothing here reads or
  // stores the secret ahead of time.
  //
  const sessionCredentials = new InMemorySessionCredentialVault({
    credentials,
    clock: new SystemClock(),
    idGenerator: new RandomIdGenerator(),
    lifetimeMs: 30_000,
  });

  console.log("Issuing A Session Credential");

  console.log("--------------------------------------------------");

  //
  // This is what an AI caller, the Runtime, or the
  // Gateway ever sees: identifiers and timestamps.
  // No secret value.
  //
  const session = await sessionCredentials.issue("sap", "authorization-001");

  console.log(`Session Credential ID : ${session.sessionCredentialId}`);

  console.log(`Connector              : ${session.connectorId}`);

  console.log(`Authorization           : ${session.authorizationId}`);

  console.log(`Issued At               : ${session.issuedAt}`);

  console.log(`Expires At              : ${session.expiresAt}`);

  console.log();

  console.log(
    "✓ No credential secret appears above — only identifiers and timestamps.",
  );

  console.log();

  //
  // Consuming the session credential.
  //
  // This is the ONLY call in the whole system that ever
  // returns the secret, and it is meant to happen exactly
  // once, immediately before the Secure Connector invokes
  // the enterprise system.
  //
  console.log("Consuming The Session Credential (inside the Secure Connector)");

  console.log("--------------------------------------------------");

  const resolved = await sessionCredentials.consume(
    session.sessionCredentialId,
  );

  console.log("✓ Secret resolved for exactly this execution.");

  console.log(
    `  Resolved value keys: ${Object.keys(resolved.value as object).join(", ")}`,
  );

  console.log();

  //
  // Reuse is rejected.
  //
  console.log("Reuse Rejection");

  console.log("--------------------------------------------------");

  try {
    await sessionCredentials.consume(session.sessionCredentialId);

    console.log("✗ Unexpected: reuse succeeded.");
  } catch (error) {
    console.log("✓ Reuse rejected:");

    console.log(`  ${(error as Error).message}`);
  }

  console.log();

  //
  // Revocation destroys a session credential outright.
  //
  console.log("Explicit Revocation");

  console.log("--------------------------------------------------");

  const second = await sessionCredentials.issue("sap", "authorization-002");

  await sessionCredentials.revoke(second.sessionCredentialId);

  try {
    await sessionCredentials.consume(second.sessionCredentialId);

    console.log("✗ Unexpected: consumption succeeded after revocation.");
  } catch (error) {
    console.log("✓ Consumption after revocation rejected:");

    console.log(`  ${(error as Error).message}`);
  }

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
