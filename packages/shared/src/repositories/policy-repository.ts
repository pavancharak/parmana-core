import { PolicyReference } from "../domain/index.js";
/**
 * Repository for published Policies.
 */
export interface PolicyRepository {
  /**
   * Resolves an exact Policy version.
   */
  resolve(name: string, version: string): Promise<PolicyReference | null>;

  /**
   * Lists published Policies.
   */
  list(page: number, pageSize: number): Promise<readonly PolicyReference[]>;
}
