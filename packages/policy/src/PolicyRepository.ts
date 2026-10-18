import type { Policy } from "./types/Policy.js";

export interface PolicyRepository {
  load(name: string, version: string): Promise<Policy>;

  /**
   * Writes `content` as the live policy.json for (name, version),
   * creating the version directory if it does not already exist and
   * overwriting whatever was there if it does. Implementations MUST
   * apply the same name/version path-safety guard as load() -- see
   * FilePolicyRepository's own VALID_NAME_OR_VERSION check -- since
   * unlike load(), a rejected write here is a prevented arbitrary
   * file write, not merely a prevented arbitrary file read.
   */
  save(name: string, version: string, content: Policy): Promise<void>;

  /**
   * Every (name, version) pair with a policy.json currently on disk --
   * for tooling that must enumerate every live policy without already
   * knowing its identity (e.g. a one-time backfill of policies that
   * predate Policy Governance into the maker-checker approval-record
   * trail, per PolicyGovernanceIntegrityMismatch's own "missing
   * approval record" gap). Ordinary request-path code always knows
   * which (name, version) it wants and should keep using load(), not
   * this.
   */
  listAll(): Promise<
    ReadonlyArray<{ readonly name: string; readonly version: string }>
  >;
}
