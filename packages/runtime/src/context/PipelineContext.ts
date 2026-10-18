/**
 * Execution Trust Pipeline metadata.
 *
 * Runtime information about a single pipeline execution.
 * This is operational metadata and is NOT part of the
 * Execution Trust Record.
 */
export interface PipelineContext {
  /**
   * Unique pipeline execution identifier.
   */
  readonly pipelineId: string;

  /**
   * Pipeline specification version.
   */
  readonly version: string;

  /**
   * UTC timestamp when execution started.
   */
  readonly startedAt: Date;
}
