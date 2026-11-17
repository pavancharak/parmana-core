import { policyV2 } from "@parmana/policy";

/**
 * The register's write path for policy version 2. Roles are part of the register, so a caller's
 * roles come from the saved register, never from the request. Each change loads the register,
 * makes the change, and saves it with its audit events in one transaction at the version it read.
 */

export type PolicyV2RegisterRole = policyV2.register.Role;

/** The part of the state store the service uses. The Postgres store satisfies it. */
export interface PolicyV2RegisterStateStore {
  load<T>(
    component: "register",
  ): Promise<{ readonly body: T; readonly version: number } | undefined>;
  saveWithAudit(
    component: "register",
    body: unknown,
    readVersion: number,
    events: readonly policyV2.persistence.AuditRow[],
  ): Promise<number>;
  readAudit(component: "register"): Promise<policyV2.persistence.AuditRow[]>;
}

export class PolicyV2ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyV2ForbiddenError";
  }
}

export interface PolicyV2RegisterServiceOptions {
  readonly state: PolicyV2RegisterStateStore;
  readonly now?: () => Date;
}

export interface PolicyV2RegisterView {
  readonly sources: readonly policyV2.register.SourceRecord[];
  readonly thresholds: readonly policyV2.register.ThresholdRecord[];
  readonly actions: readonly policyV2.register.ActionRecord[];
}

export class PolicyV2RegisterService {
  private readonly clock: () => Date;

  constructor(private readonly options: PolicyV2RegisterServiceOptions) {
    this.clock = options.now ?? (() => new Date());
  }

  /** The register's contents. Any caller that holds a register role may read them. */
  async read(callerId: string): Promise<PolicyV2RegisterView> {
    const { register } = await this.loadRegister();
    requireAnyRole(callerId, register);
    return {
      sources: register.listSources(),
      thresholds: register.listThresholds(),
      actions: register.listActions(),
    };
  }

  /** The audit log of the register, oldest first. Any caller that holds a register role may read it. */
  async auditLog(callerId: string): Promise<policyV2.persistence.AuditRow[]> {
    const { register } = await this.loadRegister();
    requireAnyRole(callerId, register);
    return this.options.state.readAudit("register");
  }

  /** Grants a role. Only the Parmana owner may grant one. */
  grantRole(
    byCaller: string,
    callerId: string,
    role: PolicyV2RegisterRole,
  ): Promise<void> {
    return this.write(byCaller, (r, p) => r.grantRole(p, callerId, role));
  }

  /** Revokes a role. Only the Parmana owner may revoke one, and the last owner cannot be revoked. */
  revokeRole(
    byCaller: string,
    callerId: string,
    role: PolicyV2RegisterRole,
  ): Promise<void> {
    return this.write(byCaller, (r, p) => r.revokeRole(p, callerId, role));
  }

  /**
   * Sets up the first Parmana owner. Does nothing and returns false once an owner exists.
   * Used by the runtime at startup, from the operator's configuration.
   */
  async bootstrapOwner(callerId: string): Promise<boolean> {
    const { register, version } = await this.loadRegister();
    const done = register.bootstrapOwner(callerId);
    if (!done) return false;
    await this.options.state.saveWithAudit(
      "register",
      register.snapshot(),
      version,
      toRows(register.takeEvents()),
    );
    return true;
  }

  proposeSource(
    byCaller: string,
    input: policyV2.register.SourceInput,
  ): Promise<policyV2.register.SourceRecord> {
    return this.write(byCaller, (r, p) => r.proposeSource(input, p));
  }

  approveSource(
    byCaller: string,
    name: string,
  ): Promise<policyV2.register.SourceRecord> {
    return this.write(byCaller, (r, p) => r.approveSource(name, p));
  }

  revokeSource(
    byCaller: string,
    name: string,
    reason: string,
  ): Promise<policyV2.register.SourceRecord> {
    return this.write(byCaller, (r, p) => r.revokeSource(name, p, reason));
  }

  proposeThreshold(
    byCaller: string,
    input: policyV2.register.ThresholdInput,
  ): Promise<policyV2.register.ThresholdRecord> {
    return this.write(byCaller, (r, p) => r.proposeThreshold(input, p));
  }

  approveThreshold(
    byCaller: string,
    action: string,
    name: string,
  ): Promise<policyV2.register.ThresholdRecord> {
    return this.write(byCaller, (r, p) => r.approveThreshold(action, name, p));
  }

  registerAction(
    byCaller: string,
    input: policyV2.register.ActionInput,
  ): Promise<policyV2.register.ActionRecord> {
    return this.write(byCaller, (r, p) => r.registerAction(input, p));
  }

  private async loadRegister(): Promise<{
    register: policyV2.register.PolicyRegister;
    version: number;
  }> {
    const register = new policyV2.register.PolicyRegister(this.clock);
    const saved =
      await this.options.state.load<policyV2.register.RegisterSnapshot>(
        "register",
      );
    if (saved !== undefined) register.load(saved.body);
    return { register, version: saved?.version ?? 0 };
  }

  private async write<T>(
    byCaller: string,
    mutate: (
      register: policyV2.register.PolicyRegister,
      person: policyV2.register.Person,
    ) => T,
  ): Promise<T> {
    const { register, version } = await this.loadRegister();
    requireAnyRole(byCaller, register);
    const person: policyV2.register.Person = {
      id: byCaller,
      roles: register.rolesOf(byCaller),
    };
    const result = mutate(register, person);
    await this.options.state.saveWithAudit(
      "register",
      register.snapshot(),
      version,
      toRows(register.takeEvents()),
    );
    return result;
  }
}

function toRows(
  events: readonly policyV2.register.AuditEvent[],
): policyV2.persistence.AuditRow[] {
  return events.map((e) => ({
    component: "register",
    at: e.at,
    by: e.by,
    event: e.event,
    detail: e.detail,
  }));
}

function requireAnyRole(
  callerId: string,
  register: policyV2.register.PolicyRegister,
): void {
  if (register.rolesOf(callerId).length === 0) {
    throw new PolicyV2ForbiddenError("The caller holds no register role.");
  }
}
