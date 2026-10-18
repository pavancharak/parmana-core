/**
 * Base class for all Parmana domain and application errors.
 */
export abstract class ParmanaError extends Error {
  /**
   * Stable machine-readable error code.
   */
  public readonly code: string;

  /**
   * Suggested HTTP status code.
   */
  public readonly status: number;

  protected constructor(code: string, message: string, status: number) {
    super(message);

    this.name = this.constructor.name;
    this.code = code;
    this.status = status;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
