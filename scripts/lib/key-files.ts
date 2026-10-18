import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";

/**
 * Shared rules for the key-generation scripts: which key IDs are safe to
 * use in a file name, and how key files are written.
 */

/**
 * A key ID becomes part of a file name, so it must not contain a path
 * separator, a leading dot, or anything else a shell or file system would
 * interpret. 1 to 64 characters: letters, digits, "." "_" and "-", starting
 * with a letter or digit.
 */
export const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const PRIVATE_KEY_MODE = 0o600;
export const PUBLIC_KEY_MODE = 0o644;

export function assertSafeKeyId(keyId: string): string {
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new Error(
      `Unsafe key ID "${keyId}": use 1 to 64 letters, digits, ".", "_" or "-", ` +
        "starting with a letter or digit.",
    );
  }

  return keyId;
}

export function ensureKeyDirectory(directory: string): void {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
}

/**
 * Writes a key file and then sets its mode explicitly. The mode argument to
 * writeFileSync only applies when the file is created, and the process umask
 * can widen it; chmodSync makes the result the same on every run.
 */
export function writeKeyFile(
  path: string,
  contents: string,
  mode: number,
  overwrite: boolean,
): void {
  writeFileSync(path, contents, { mode, flag: overwrite ? "w" : "wx" });
  chmodSync(path, mode);
}
