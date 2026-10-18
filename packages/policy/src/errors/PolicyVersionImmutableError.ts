import { PolicyError } from "./PolicyError.js";

/**
 * Thrown by FilePolicyRepository.save() when the version already exists
 * with different content. A published (name, version) is immutable: a
 * change needs a new version. Re-saving identical content is allowed
 * (an approved rollback to the same rules).
 */
export class PolicyVersionImmutableError extends PolicyError {
  constructor(name: string, version: string) {
    super(
      `Policy "${name}"@"${version}" already exists with different content. ` +
        "Published policy versions are immutable; propose a new version.",
    );
    this.name = "PolicyVersionImmutableError";
  }
}
