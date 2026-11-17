import { policyV2 } from "@parmana/policy";

/**
 * The register's write path for policy version 2. A caller's roles come from the role store,
 * never from the request. Each change loads the register, makes the change, and saves it back
 * at the version it read, so two writers cannot overwrite each other.
 */

export type PolicyV2RegisterRole = policyV2.register.Role;

/** The part of the role store the service uses. */
export interface PolicyV2RoleStoreLike {
  rolesOf(callerId: string): Promise<string[]>;
  changeRole(change: {
    callerId: string;
    role: string;
    action: "grant" | "revoke";
    byCaller: string;
  }): Promise<void>;
}

/** The part of the state store the service uses. */
export interface PolicyV2RegisterStateStore {
  load<T>(
    component: "register",
  ): Promise<{ readonly body: T; readonly version: number } | undefined>;
  save(
    component: "register",
    body: unknown,
    readVersion: number,
  ): Promise<number>;
}

export class PolicyV2ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyV2ForbiddenError";
  }
}

export interface PolicyV2RegisterServiceOptions {
  readonly state: PolicyV2RegisterStateStore;
  readonly roles: PolicyV2RoleStoreLike;
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
    const person = await this.person(callerId);
    requireAnyRole(person);
    const register = await this.loadRegister();
    return {
      sources: register.listSources(),
      thresholds: register.listThresholds(),
      actions: register.listActions(),
    };
  }

  /** Grants a role. Only the Parmana owner may grant a role. */
  async grantRole(
    byCaller: string,
    callerId: string,
    role: PolicyV2RegisterRole,
  ): Promise<void> {
    await this.changeRole(byCaller, callerId, role, "grant");
  }

  /** Revokes a role. Only the Parmana owner may revoke one, and the last owner cannot be revoked. */
  async revokeRole(
    byCaller: string,
    callerId: string,
    role: PolicyV2RegisterRole,
  ): Promise<void> {
    await this.changeRole(byCaller, callerId, role, "revoke");
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

  private async person(callerId: string): Promise<policyV2.register.Person> {
    const roles = await this.options.roles.rolesOf(callerId);
    return {
      id: callerId,
      roles: roles as PolicyV2RegisterRole[],
    };
  }

  private async loadRegister(): Promise<policyV2.register.PolicyRegister> {
    const register = new policyV2.register.PolicyRegister(this.clock);
    const saved =
      await this.options.state.load<policyV2.register.RegisterSnapshot>(
        "register",
      );
    if (saved !== undefined) register.load(saved.body);
    return register;
  }

  private async changeRole(
    byCaller: string,
    callerId: string,
    role: PolicyV2RegisterRole,
    action: "grant" | "revoke",
  ): Promise<void> {
    const actor = await this.person(byCaller);
    requireOwner(actor);
    // The role change is recorded first, so the last-owner guard decides before the audit line is written.
    await this.options.roles.changeRole({
      callerId,
      role,
      action,
      byCaller,
    });
    await this.write(byCaller, (register, p) =>
      register.recordRoleChange(p, callerId, role, action),
    );
  }

  private async write<T>(
    byCaller: string,
    mutate: (
      register: policyV2.register.PolicyRegister,
      person: policyV2.register.Person,
    ) => T,
  ): Promise<T> {
    const person = await this.person(byCaller);
    requireAnyRole(person);
    const saved =
      await this.options.state.load<policyV2.register.RegisterSnapshot>(
        "register",
      );
    const register = new policyV2.register.PolicyRegister(this.clock);
    if (saved !== undefined) register.load(saved.body);
    const result = mutate(register, person);
    await this.options.state.save(
      "register",
      register.snapshot(),
      saved?.version ?? 0,
    );
    return result;
  }
}

function requireAnyRole(person: policyV2.register.Person): void {
  if (person.roles.length === 0) {
    throw new PolicyV2ForbiddenError("The caller holds no register role.");
  }
}

function requireOwner(person: policyV2.register.Person): void {
  if (!person.roles.includes("parmana-owner")) {
    throw new PolicyV2ForbiddenError(
      "Only the Parmana owner may change roles.",
    );
  }
}
