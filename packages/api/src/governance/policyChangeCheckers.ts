/**
 * Which callers may approve a pending policy change, per policy (G-50).
 *
 * Before this, any human caller with a valid step-up signature could approve
 * a change to any policy. The approve route now also requires the caller to
 * be listed for that policy. The list is read from POLICY_CHANGE_CHECKERS, a
 * JSON object of policy name to an array of caller ids. An unset or empty
 * variable lists no one, so approval is refused until it is configured.
 */
export type PolicyChangeCheckerScope = Readonly<
  Record<string, readonly string[]>
>;

export function parsePolicyChangeCheckers(
  raw: string | undefined,
): PolicyChangeCheckerScope {
  if (raw === undefined || raw.trim() === "") {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "POLICY_CHANGE_CHECKERS is not valid JSON. Expected an object of policy name to caller id arrays.",
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "POLICY_CHANGE_CHECKERS must be a JSON object of policy name to caller id arrays.",
    );
  }

  const scope: Record<string, readonly string[]> = {};

  for (const [policyName, callerIds] of Object.entries(parsed)) {
    const valid =
      Array.isArray(callerIds) &&
      callerIds.every((id) => typeof id === "string" && id.trim() !== "");

    if (!valid || policyName.trim() === "") {
      throw new Error(
        `POLICY_CHANGE_CHECKERS["${policyName}"] must be an array of non-empty caller ids.`,
      );
    }

    scope[policyName] = [...callerIds];
  }

  return scope;
}

export function isCheckerInScope(
  scope: PolicyChangeCheckerScope,
  policyName: string,
  callerId: string,
): boolean {
  return scope[policyName]?.includes(callerId) === true;
}
