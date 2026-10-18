import { createHash } from "node:crypto";

import { HashAlgorithms, type HashAlgorithm } from "@parmana/shared";

import type { HashProvider } from "../HashProvider.js";

/**
 * SHA-256 Hash Provider.
 */
export class SHA256HashProvider implements HashProvider {
  public readonly algorithm: HashAlgorithm = HashAlgorithms.SHA256;

  async hash(data: Uint8Array): Promise<string> {
    return createHash("sha256").update(data).digest("hex");
  }
}
