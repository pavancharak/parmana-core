import { PolicyError } from "./PolicyError.js";

/**
 * Thrown by FilePolicyRepository.save() when name or version does not
 * match VALID_NAME_OR_VERSION -- the write-side counterpart of
 * PolicyNotFoundError's own guard on load(). Kept as a distinct type
 * (rather than reusing PolicyNotFoundError) since the two failures
 * are not the same event: this one is a rejected write target, not a
 * read that came up empty, and there is no read-side "don't reveal
 * whether the path exists" reason to disguise it as one -- the write
 * path only runs deep inside an authenticated, maker-checker-approved
 * flow, never in response to unauthenticated input.
 */
export class PolicyWriteRejectedError extends PolicyError {
  constructor(name: string, version: string) {
    super(
      `Refusing to write policy '${name}' version '${version}': name and ` +
        "version must match ^[A-Za-z0-9._-]+$.",
    );

    this.name = "PolicyWriteRejectedError";
  }
}
