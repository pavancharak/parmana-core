/**
 * Recursively freezes an object graph.
 *
 * Object.freeze() alone is shallow: a frozen object
 * whose properties are themselves objects (for
 * example, ExecutableContent.parameters) can still
 * have those nested objects mutated. This walks the
 * graph and freezes every plain object and array it
 * reaches.
 *
 * This is defense-in-depth only. The Gateway's
 * integrity guarantee comes from the hash comparison
 * in ExecutionGateway.verify, not from freezing —
 * freezing only stops the frozen value from being
 * mutated in-process between verification and the
 * Connector call.
 */
export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const property of Object.values(value)) {
      deepFreeze(property);
    }

    Object.freeze(value);
  }

  return value;
}
