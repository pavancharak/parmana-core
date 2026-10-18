import { ParmanaError } from "./parmana-error.js";

/**
 * Thrown by ChallengeRecordRepository.append when no ChallengeRecord
 * exists for the given id.
 */
export class ChallengeRecordNotFoundError extends ParmanaError {
  constructor(challengeRecordId: string) {
    super(
      "CHALLENGE_RECORD_NOT_FOUND",
      `Challenge Record '${challengeRecordId}' not found.`,
      404,
    );
  }
}
