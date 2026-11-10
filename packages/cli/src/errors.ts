/**
 * Errors the CLI reports on purpose. Each carries the exit code it should end
 * the process with, so a caller can tell a usage mistake (2) from a failure
 * the server or a script reported (1).
 */
export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

/** A mistake in how the command was called, or in a file it was given. */
export class CliUsageError extends CliError {
  constructor(message: string) {
    super(message, 2);
    this.name = "CliUsageError";
  }
}

/** The server, the network, or a script reported a failure. */
export class CliFailure extends CliError {
  constructor(message: string) {
    super(message, 1);
    this.name = "CliFailure";
  }
}
