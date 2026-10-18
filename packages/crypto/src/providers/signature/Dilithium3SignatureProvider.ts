import { sign, verify, type KeyObject } from "node:crypto";

import { SignatureAlgorithms, type SignatureAlgorithm } from "@parmana/shared";

import type { SignatureProvider } from "../SignatureProvider.js";
import { assertKeyType } from "./assertKeyType.js";

const NODE_KEY_TYPE = "ml-dsa-65";

/**
 * Dilithium3 (ML-DSA-65) Signature Provider.
 *
 * Stateless implementation of ML-DSA-65 signing via
 * node:crypto's native support (Node >=24, OpenSSL >=3.5).
 *
 * Key management is delegated to a KeyProvider exactly like
 * Ed25519SignatureProvider.
 *
 * ML-DSA-65 signatures are randomized: signing the same
 * message twice with the same key produces different
 * (but valid) signatures.
 */
export class Dilithium3SignatureProvider implements SignatureProvider {
  public readonly algorithm: SignatureAlgorithm =
    SignatureAlgorithms.DILITHIUM3;

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

    return verify(
      null,
      Buffer.from(data),
      publicKey,
      Buffer.from(signature, "base64"),
    );
  }
}
