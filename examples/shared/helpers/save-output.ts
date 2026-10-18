import { mkdir, writeFile } from "node:fs/promises";

import path from "node:path";

/**
 * Save example output as formatted JSON.
 *
 * @param outputDirectory Directory to write into.
 * @param fileName Output filename.
 * @param value JSON value.
 */
export async function saveOutput(
  outputDirectory: string,
  fileName: string,
  value: unknown,
): Promise<void> {
  await mkdir(outputDirectory, {
    recursive: true,
  });

  const outputPath = path.join(outputDirectory, fileName);

  await writeFile(outputPath, JSON.stringify(value, null, 2), "utf8");

  console.log(`Saved output: ${outputPath}`);
}

/**
 * Save an Execution Trust Record.
 */
export async function saveTrustRecord(
  outputDirectory: string,
  trustRecord: unknown,
): Promise<void> {
  await saveOutput(outputDirectory, "execution-trust-record.json", trustRecord);
}

/**
 * Save a Verification result.
 */
export async function saveVerification(
  outputDirectory: string,
  verification: unknown,
): Promise<void> {
  await saveOutput(outputDirectory, "verification.json", verification);
}

/**
 * Save a Receipt.
 */
export async function saveReceipt(
  outputDirectory: string,
  receipt: unknown,
): Promise<void> {
  await saveOutput(outputDirectory, "receipt.json", receipt);
}

/**
 * Save a Replay result.
 */
export async function saveReplay(
  outputDirectory: string,
  replay: unknown,
): Promise<void> {
  await saveOutput(outputDirectory, "replay.json", replay);
}
