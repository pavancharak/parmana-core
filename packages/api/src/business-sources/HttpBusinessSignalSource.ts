import crypto from "node:crypto";

import {
  CanonicalSerializer,
  DEFAULT_KEY_ID,
  SignerBootstrap,
  type Signer,
} from "@parmana/crypto";
import {
  createPinnedHttpsTransport,
  type ReleaseTransport,
} from "@parmana/execution-gateway";
import type {
  BusinessSignalQuery,
  BusinessSignalSource,
  BusinessSignalSourceAnswer,
  BusinessSignalSourceRegistry,
} from "@parmana/runtime";
import {
  checkEndpointUrl,
  resolvePublicEndpointAddresses,
  systemEndpointAddressLookup,
  type BusinessSignalSourceRegistration,
  type BusinessSignalSourceRepository,
  type EndpointAddressLookup,
  type JsonValue,
} from "@parmana/shared";

/**
 * The wire protocol between Parmana and a business signal source
 * (RFC-0023 phase 2). Parmana POSTs a SignedBusinessSignalQuery; the
 * source answers HTTP 200 with a BusinessSignalAnswerEnvelope.
 */

/** How long a signed query is valid. */
export const BUSINESS_SIGNAL_QUERY_TTL_MS = 60_000;

/** The largest answer accepted from a source. */
export const BUSINESS_SIGNAL_ANSWER_MAX_BYTES = 16 * 1024;

/**
 * What Parmana asks. Signed with Parmana's default key (the key at
 * GET /keys/default) over the canonical JSON of this object, so a source
 * can check the question came from Parmana and was meant for it
 * (audience).
 */
export interface BusinessSignalQueryMessage {
  readonly version: 1;
  readonly source: string;
  readonly audience: string;
  readonly signalKey: string;
  readonly claim: string;
  readonly subject: string;
  readonly action: string;
  readonly businessTransactionId: string;
  /** Unique per query; the answer must echo it. */
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface SignedBusinessSignalQuery {
  readonly query: BusinessSignalQueryMessage;
  readonly signature: {
    readonly algorithm: string;
    readonly keyId: string;
    readonly value: string;
  };
}

/**
 * What the source answers. A source registered with a public key signs
 * the canonical JSON of this object with Ed25519 and puts the base64
 * signature in the envelope.
 */
export interface BusinessSignalAnswerMessage {
  readonly version: 1;
  readonly source: string;
  readonly nonce: string;
  readonly signalKey: string;
  readonly claim: string;
  readonly subject: string;
  readonly status: "observed" | "not_found" | "conflicting";
  /** With "observed": the fact's value. */
  readonly value?: JsonValue;
  /** With "observed": when the source established it, ISO 8601. */
  readonly observedAt?: string;
  /** Optional: until when the source says it holds, ISO 8601. */
  readonly validUntil?: string;
  /** With "not_found" or "conflicting": why. */
  readonly reason?: string;
}

export interface BusinessSignalAnswerEnvelope {
  readonly answer: BusinessSignalAnswerMessage;
  readonly signature?: {
    readonly algorithm: "ed25519";
    readonly keyId?: string;
    readonly value: string;
  };
}

export interface HttpBusinessSignalSourceOptions {
  /** Defaults to the configured signer and DEFAULT_KEY_ID. */
  readonly signer?: Signer;
  readonly keyId?: string;
  /** Defaults to the system resolver. */
  readonly lookup?: EndpointAddressLookup;
  /** Defaults to createPinnedHttpsTransport(). */
  readonly transport?: ReleaseTransport;
  readonly now?: () => Date;
}

/**
 * Asks one registered business system over HTTPS. Like an external
 * connector release: the endpoint's address is checked on every query
 * and the connection is pinned to it, redirects are not followed, and
 * the answer is size limited. Throws, which the resolver records as
 * SOURCE_UNAVAILABLE, for any answer it cannot trust: not HTTP 200, not
 * JSON, not echoing the query, or, for a source registered with a key,
 * missing or failing its signature.
 */
export class HttpBusinessSignalSource implements BusinessSignalSource {
  readonly name: string;
  private readonly url: URL;
  private readonly publicKey?: crypto.KeyObject;
  private readonly serializer = new CanonicalSerializer();

  constructor(
    private readonly registration: BusinessSignalSourceRegistration,
    private readonly options: HttpBusinessSignalSourceOptions = {},
  ) {
    const checked = checkEndpointUrl(registration.endpointUrl);

    if (!checked.ok) {
      throw new Error(
        `Business signal source "${registration.name}" has an endpoint Parmana will not query: ${checked.reason}`,
      );
    }

    this.name = registration.name;
    this.url = checked.url;

    if (registration.publicKeyPem !== undefined) {
      this.publicKey = crypto.createPublicKey(registration.publicKeyPem);
    }
  }

  async resolve(
    query: BusinessSignalQuery,
  ): Promise<BusinessSignalSourceAnswer> {
    const now = (this.options.now ?? (() => new Date()))();
    const addresses = await resolvePublicEndpointAddresses(
      this.url,
      this.options.lookup ?? systemEndpointAddressLookup,
    );

    const message: BusinessSignalQueryMessage = {
      version: 1,
      source: this.name,
      audience: this.url.href,
      signalKey: query.signalKey,
      claim: query.claim,
      subject: query.subject,
      action: query.action,
      businessTransactionId: query.businessTransactionId,
      nonce: crypto.randomUUID(),
      issuedAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + BUSINESS_SIGNAL_QUERY_TTL_MS,
      ).toISOString(),
    };

    const keyId = this.options.keyId ?? DEFAULT_KEY_ID;
    const signer = this.options.signer ?? (await SignerBootstrap.create());
    const signed: SignedBusinessSignalQuery = {
      query: message,
      signature: {
        algorithm: (await signer.getMetadata(keyId)).algorithm,
        keyId,
        value: await signer.sign(keyId, this.serializer.serialize(message)),
      },
    };

    const transport =
      this.options.transport ??
      createPinnedHttpsTransport({
        maxResponseBytes: BUSINESS_SIGNAL_ANSWER_MAX_BYTES,
      });

    const response = await transport({
      url: this.url,
      addresses,
      body: JSON.stringify(signed),
      timeoutMs: this.registration.timeoutMs,
    });

    if (response.status !== 200) {
      throw new Error(`the source answered HTTP ${response.status}`);
    }

    return this.accept(message, response.body);
  }

  private accept(
    query: BusinessSignalQueryMessage,
    body: string,
  ): BusinessSignalSourceAnswer {
    let envelope: BusinessSignalAnswerEnvelope;

    try {
      envelope = JSON.parse(body) as BusinessSignalAnswerEnvelope;
    } catch {
      throw new Error("the source's answer is not JSON");
    }

    const answer = envelope?.answer;

    if (typeof answer !== "object" || answer === null) {
      throw new Error("the source's answer has no answer object");
    }

    for (const field of [
      "source",
      "nonce",
      "signalKey",
      "claim",
      "subject",
    ] as const) {
      if (answer[field] !== query[field]) {
        throw new Error(
          `the source's answer does not echo the query's ${field}`,
        );
      }
    }

    if (answer.version !== 1) {
      throw new Error("the source's answer is not version 1");
    }

    const verified = this.verifySignature(answer, envelope.signature);

    if (answer.status === "not_found" || answer.status === "conflicting") {
      return {
        kind: answer.status,
        reason:
          typeof answer.reason === "string" ? answer.reason : "no reason given",
      };
    }

    if (answer.status !== "observed") {
      throw new Error("the source's answer has an unknown status");
    }

    const observedAt = new Date(String(answer.observedAt));
    const validUntil =
      answer.validUntil !== undefined
        ? new Date(String(answer.validUntil))
        : undefined;

    if (Number.isNaN(observedAt.getTime())) {
      throw new Error("the source's answer has no valid observedAt");
    }

    if (validUntil !== undefined && Number.isNaN(validUntil.getTime())) {
      throw new Error("the source's answer has an invalid validUntil");
    }

    if (answer.value === undefined) {
      throw new Error("the source's observed answer has no value");
    }

    return {
      kind: "observed",
      value: answer.value,
      sourceIdentity: this.url.href,
      observedAt,
      ...(validUntil !== undefined && { validUntil }),
      ...(verified !== undefined && {
        sourceProof: verified.value,
        ...(this.registration.keyId !== undefined && {
          sourceKeyId: this.registration.keyId,
        }),
        sourceProofVerified: true,
      }),
    };
  }

  /**
   * For a source registered with a key: the signature, verified, or a
   * throw. For one without: undefined, and any signature is ignored,
   * since there is nothing to check it against.
   */
  private verifySignature(
    answer: BusinessSignalAnswerMessage,
    signature: BusinessSignalAnswerEnvelope["signature"],
  ): { value: string } | undefined {
    if (this.publicKey === undefined) {
      return undefined;
    }

    if (
      typeof signature !== "object" ||
      signature === null ||
      signature.algorithm !== "ed25519" ||
      typeof signature.value !== "string"
    ) {
      throw new Error(
        "the source is registered with a key, but its answer is not signed with ed25519",
      );
    }

    if (
      this.registration.keyId !== undefined &&
      signature.keyId !== undefined &&
      signature.keyId !== this.registration.keyId
    ) {
      throw new Error(
        `the source's answer is signed with key "${signature.keyId}", not the registered "${this.registration.keyId}"`,
      );
    }

    const valid = crypto.verify(
      null,
      Buffer.from(this.serializer.serialize(answer)),
      this.publicKey,
      Buffer.from(signature.value, "base64"),
    );

    if (!valid) {
      throw new Error(
        "the source's answer signature does not verify against its registered key",
      );
    }

    return { value: signature.value };
  }
}

/**
 * The sources registered through maker checker, read on every lookup so
 * a revoke takes effect immediately.
 */
export class RepositoryBusinessSignalSourceRegistry implements BusinessSignalSourceRegistry {
  constructor(
    private readonly repository: BusinessSignalSourceRepository,
    private readonly options: HttpBusinessSignalSourceOptions = {},
  ) {}

  async get(name: string): Promise<BusinessSignalSource | undefined> {
    const registration = await this.repository.findActive(name);

    return registration === null
      ? undefined
      : new HttpBusinessSignalSource(registration, this.options);
  }
}
