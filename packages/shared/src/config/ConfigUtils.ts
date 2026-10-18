/**
 * Returns an object containing the property only when
 * the value is defined.
 */
export function optionalProperty<T>(
  key: string,
  value: T | undefined,
): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}
