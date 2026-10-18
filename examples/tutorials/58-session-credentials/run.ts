import {
  InMemoryCredentialVault,
  InMemorySessionCredentialVault,
  RandomIdGenerator,
  SystemClock,
} from "@parmana/execution-control";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 58 - Session Credentials");
  console.log("==================================================");
  console.log();

  const credentials = new InMemoryCredentialVault();

  credentials.setCredential("oracle", {
    value: Object.freeze({
      token: "oracle-secret-9876",
    }),
  });

  //
  // A short 1-second lifetime makes real expiry
  // observable in a few seconds, without a fake clock.
  //
  const sessionCredentials = new InMemorySessionCredentialVault({
    credentials,
    clock: new SystemClock(),
    idGenerator: new RandomIdGenerator(),
    lifetimeMs: 1_000,
  });

  //
  // Happy path: issue, then consume before expiry.
  //
  console.log("Happy Path");

  console.log("--------------------------------------------------");

  const happyPath = await sessionCredentials.issue(
    "oracle",
    "authorization-001",
  );

  console.log(`Issued  : ${happyPath.sessionCredentialId}`);

  const happyResult = await sessionCredentials.consume(
    happyPath.sessionCredentialId,
  );

  console.log(
    `Consumed: ${Object.keys(happyResult.value as object).join(", ")}`,
  );

  console.log("✓ Consumed within the lifetime window.");

  console.log();

  //
  // Expiry: issue, wait past the lifetime, then consume.
  //
  console.log("Expiry");

  console.log("--------------------------------------------------");

  const expiring = await sessionCredentials.issue(
    "oracle",
    "authorization-002",
  );

  console.log(`Issued at : ${expiring.issuedAt}`);

  console.log(`Expires at: ${expiring.expiresAt}`);

  console.log("Waiting past the 1-second lifetime...");

  await sleep(1_100);

  try {
    await sessionCredentials.consume(expiring.sessionCredentialId);

    console.log("✗ Unexpected: consumption succeeded after expiry.");
  } catch (error) {
    console.log("✓ Consumption after expiry rejected:");

    console.log(`  ${(error as Error).message}`);
  }

  console.log();

  //
  // Reuse: issue, consume once, consume again.
  //
  console.log("Reuse");

  console.log("--------------------------------------------------");

  const reused = await sessionCredentials.issue("oracle", "authorization-003");

  await sessionCredentials.consume(reused.sessionCredentialId);

  console.log("✓ First consumption succeeded.");

  try {
    await sessionCredentials.consume(reused.sessionCredentialId);

    console.log("✗ Unexpected: second consumption succeeded.");
  } catch (error) {
    console.log("✓ Second consumption rejected:");

    console.log(`  ${(error as Error).message}`);
  }

  console.log();

  //
  // Revocation: issue, revoke, consume.
  //
  console.log("Revocation");

  console.log("--------------------------------------------------");

  const revoked = await sessionCredentials.issue("oracle", "authorization-004");

  await sessionCredentials.revoke(revoked.sessionCredentialId);

  console.log("✓ Session credential revoked before use.");

  try {
    await sessionCredentials.consume(revoked.sessionCredentialId);

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
