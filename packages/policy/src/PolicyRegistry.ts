export interface RegisteredPolicy {
  /**
   * Policy name.
   */
  name: string;

  /**
   * Policy version.
   */
  version: string;

  /**
   * Absolute or relative path to the policy file.
   */
  path: string;
}

/**
 * Canonical Policy Registry.
 *
 * Maintains metadata about available versioned policies.
 *
 * It DOES NOT:
 * - load policies
 * - evaluate policies
 * - choose policies
 */
export class PolicyRegistry {
  private readonly registry = new Map<string, RegisteredPolicy>();

  /**
   * Register a policy.
   */
  public register(policy: RegisteredPolicy): void {
    this.registry.set(`${policy.name}:${policy.version}`, policy);
  }

  /**
   * Find a registered policy.
   */
  public find(name: string, version: string): RegisteredPolicy | undefined {
    return this.registry.get(`${name}:${version}`);
  }

  /**
   * Returns all registered policies.
   */
  public list(): readonly RegisteredPolicy[] {
    return [...this.registry.values()];
  }

  /**
   * Returns true if the policy exists.
   */
  public has(name: string, version: string): boolean {
    return this.registry.has(`${name}:${version}`);
  }

  /**
   * Removes a registered policy.
   */
  public unregister(name: string, version: string): boolean {
    return this.registry.delete(`${name}:${version}`);
  }

  /**
   * Clears the registry.
   */
  public clear(): void {
    this.registry.clear();
  }

  /**
   * Number of registered policies.
   */
  public size(): number {
    return this.registry.size;
  }
}
