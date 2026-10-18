import type { SignatureAlgorithm } from "../config/CryptoAlgorithms.js";

import type { GatewayAuthentication } from "./GatewayAuthentication.js";

export interface SignedGatewayAuthentication {
  readonly payload: GatewayAuthentication;

  readonly signature: string;

  readonly keyId: string;

  readonly algorithm: SignatureAlgorithm;
}
