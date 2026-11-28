import type {
  CallerAuthenticator,
  CallerIdentity,
} from "./CallerAuthenticator.js";

const JWT_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * Sends a JWT-shaped credential to the OIDC authenticator and everything else to
 * the static-key authenticator. A JWT that the OIDC authenticator refuses is
 * refused outright. It is never retried against the static keys.
 */
export class CompositeCallerAuthenticator implements CallerAuthenticator {
  constructor(
    private readonly oidc: CallerAuthenticator,
    private readonly staticKeys: CallerAuthenticator,
  ) {}

  authenticate(
    credential: string | undefined,
  ): Promise<CallerIdentity | undefined> {
    if (credential !== undefined && looksLikeJwt(credential)) {
      return this.oidc.authenticate(credential);
    }
    return this.staticKeys.authenticate(credential);
  }
}

export function looksLikeJwt(credential: string): boolean {
  const segments = credential.split(".");
  return (
    segments.length === 3 &&
    segments.every((segment) => JWT_SEGMENT.test(segment))
  );
}
