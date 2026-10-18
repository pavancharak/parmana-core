/**
 * Base error for all Runtime-related failures.
 *
 * All Runtime exceptions should extend this class.
 */
export class RuntimeError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly code: string = "RUNTIME_ERROR",
  ) {
    super(message);

    this.name = new.target.name;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
