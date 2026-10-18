import { sign, verify, type KeyObject } from "node:crypto";

import { SignatureAlgorithms, type SignatureAlgorithm } from "@parmana/shared";

import type { SignatureProvider } from "../SignatureProvider.js";
import { assertKeyType } from "./assertKeyType.js";
import {
  commitmentMessage,
  requiresCommitment,
} from "../../SignatureCommitment.js";

const NODE_KEY_TYPE = "ed25519";

/**
 * Ed25519 Signature Provider.
 *
 * Stateless implementation of Ed25519 signing.
 *
 * Key management is delegated to a KeyProvider.
 */
export class Ed25519SignatureProvider implements SignatureProvider {
  public readonly algorithm: SignatureAlgorithm = SignatureAlgorithms.ED25519;

  constructor() {
    Object.freeze(this);
  }

  async sign(data: Uint8Array, privateKey: KeyObject): Promise<string> {
    assertKeyType(privateKey, NODE_KEY_TYPE, "sign");

    const signature = sign(null, Buffer.from(data), privateKey);

    return signature.toString("base64");
  }

  async verify(
    data: Uint8Array,
    signature: string,
    publicKey: KeyObject,
  ): Promise<boolean> {
    assertKeyType(publicKey, NODE_KEY_TYPE, "verify");

    const signatureBytes = Buffer.from(signature, "base64");

    if (verify(null, Buffer.from(data), publicKey, signatureBytes)) {
      return true;
    }

    //
    // A message over the KMS raw limit may have been signed as a fixed
    // size commitment (see SignatureCommitment.ts). Only for such large
    // messages: a commitment signature over a small message is rejected.
    //
    if (requiresCommitment(data)) {
      return verify(
        null,
        Buffer.from(commitmentMessage(data)),
        publicKey,
        signatureBytes,
      );
    }

    return false;
  }
}
