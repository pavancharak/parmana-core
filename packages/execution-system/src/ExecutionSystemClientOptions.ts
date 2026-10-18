/**
 * Configuration for an Execution System client.
 */
export interface ExecutionSystemClientOptions {
  /**
   * Base URL of the execution system.
   */
  readonly baseUrl: string;

  /**
   * Optional HTTP headers.
   */
  readonly headers?: Readonly<Record<string, string>>;

  /**
   * Optional request timeout in milliseconds.
   */
  readonly timeout?: number;
}
