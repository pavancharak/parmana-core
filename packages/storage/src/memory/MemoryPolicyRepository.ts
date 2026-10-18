import { PolicyReference, PolicyRepository } from "@parmana/shared";

/**
 * In-memory Policy repository.
 *
 * Stores published Policy references.
 */
export class MemoryPolicyRepository implements PolicyRepository {
  private readonly policies = new Map<string, PolicyReference>();

  /**
   * Registers a PolicyReference.
   *
   * Convenience method for tests.
   */
  add(policy: PolicyReference): void {
    this.policies.set(`${policy.name}:${policy.version}`, policy);
  }

  async resolve(
    name: string,
    version: string,
  ): Promise<PolicyReference | null> {
    return this.policies.get(`${name}:${version}`) ?? null;
  }

  async list(
    page: number,
    pageSize: number,
  ): Promise<readonly PolicyReference[]> {
    const values = [...this.policies.values()];

    const start = (page - 1) * pageSize;

    return values.slice(start, start + pageSize);
  }
}
