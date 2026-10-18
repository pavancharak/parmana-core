/**
 * Business signals evaluated by a Policy.
 *
 * Parmana is policy-driven and therefore does not define
 * the structure of business signals. The resolved Policy
 * and its associated Signal Schema determine the allowed
 * fields and validation rules.
 */
export type Signals = Readonly<Record<string, unknown>>;
