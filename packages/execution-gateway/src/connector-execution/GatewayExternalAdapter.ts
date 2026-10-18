import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";

import {
  connectorCapabilities,
  type Connector,
  type ConnectorCapabilities,
  type ConnectorExecutionContext,
  type ConnectorRequest,
  type ConnectorResponse,
} from "@parmana/connector-sdk";
import {
  CanonicalSerializer,
  DEFAULT_KEY_ID,
  SignerBootstrap,
  type Signer,
} from "@parmana/crypto";
import {
  ExternalEndpointAddressError,
  checkEndpointUrl,
  resolvePublicEndpointAddresses,
  systemEndpointAddressLookup,
  type EndpointAddressLookup,
  type ResolvedAddress,
} from "@parmana/shared";

/**
 * How long a signed release is valid (ADR-0013, section 2).
 */
export const EXTERNAL_RELEASE_TTL_MS = 60_000;

/**
 * The largest answer body read from an endpoint, and the largest result
 * accepted inside it (ADR-0013, section 4).
 */
export const EXTERNAL_ANSWER_MAX_BYTES = 64 * 1024;
export const EXTERNAL_RESULT_MAX_BYTES = 16 * 1024;

/**
 * One registered external connector, as the adapter needs it.
 */
export interface ExternalConnectorTarget {
  readonly capability: string;
  readonly endpointUrl: string;
  readonly allowedParameters: readonly string[];
  readonly timeoutMs: number;
}

/**
 * The release Parmana signs and sends (ADR-0013, section 2). The
 * signature covers the canonical JSON of this object.
 */
export interface ExternalRelease {
  readonly version: 1;
  readonly connectorId: string;
  readonly audience: string;
  readonly businessTransactionId: string;
  readonly authorizationId: string;
  readonly capability: string;
  readonly target: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly policy: {
    readonly name: string;
    readonly version: string;
    readonly contentHash?: string;
  };
  readonly approvedBy: readonly {
    readonly approverId: string;
    readonly keyId: string;
    readonly approvalId: string;
  }[];
  readonly issuedAt: string;
  readonly expiresAt: string;

  /**
   * RFC-0023 phase 4: the business facts the authorization rests on,
   * each with the value its source gave and until when it holds. The
   * endpoint executes only if each still holds in its own records, in
   * the same transaction as the action, and otherwise answers with
   * success false and conditionsNotMet true. Absent when the decision
   * sourced no facts.
   */
  readonly conditions?: readonly {
    readonly signalKey: string;
    readonly source: string;
    readonly claim: string;
    readonly subject: string;
    readonly value: unknown;
    readonly validUntil: string;
  }[];
}

export interface SignedExternalRelease {
  readonly release: ExternalRelease;
  readonly signature: {
    readonly algorithm: string;
    readonly keyId: string;
    readonly value: string;
  };
}

export interface ReleaseTransportRequest {
  readonly url: URL;

  /**
   * The addresses the host resolved to, every one already checked to be
   * public. The transport connects to one of these and never resolves
   * the host again.
   */
  readonly addresses: readonly ResolvedAddress[];
  readonly body: string;
  readonly timeoutMs: number;
}

export interface ReleaseTransportResponse {
  readonly status: number;
  readonly body: string;
}

export type ReleaseTransport = (
  request: ReleaseTransportRequest,
) => Promise<ReleaseTransportResponse>;

export interface GatewayExternalAdapterOptions {
  readonly target: ExternalConnectorTarget;

  /**
   * Defaults to the configured signer (SignerBootstrap) and its default
   * key, the key published at GET /keys/default.
   */
  readonly signer?: Signer;
  readonly keyId?: string;

  /**
   * Defaults to the system resolver. Tests pass their own.
   */
  readonly lookup?: EndpointAddressLookup;

  /**
   * Defaults to createPinnedHttpsTransport().
   */
  readonly transport?: ReleaseTransport;

  readonly now?: () => Date;
}

/**
 * External connector (ADR-0013): releases an approved request to the
 * HTTPS endpoint an operator registered for the capability, as a signed
 * release, and checks the endpoint's answer before recording it.
 *
 * Like GatewayPaytmAdapter it never calls the external system itself
 * and holds none of its credentials: the endpoint verifies the release
 * against Parmana's public key and acts with its own. Unlike it, there
 * is no shared secret: the signature is the authentication, and its
 * audience is this endpoint's URL, so a release sent to one endpoint
 * cannot be replayed to another. It expires 60 seconds after it is
 * issued.
 *
 * Refused before anything is sent: a request with no signed
 * authorization behind it (context.release), a parameter not in the
 * registration's allowedParameters, and an endpoint whose host does not
 * resolve only to public addresses. The address is resolved here, at
 * every release, and the transport connects to that address, so a DNS
 * change after registration cannot point the release inside Parmana's
 * network. Redirects are not followed.
 *
 * The answer is accepted only when it is HTTP 200 and JSON that echoes
 * businessTransactionId and capability, with a boolean success and a
 * result object of at most 16 KB. Anything else throws, and the Gateway
 * records the outcome as unknown: the endpoint may have acted.
 *
 * RFC-0023 phase 4: a release carries the business conditions of its
 * signed authorization, and expires no later than the earliest one. An
 * endpoint that finds a condition no longer holds answers success false
 * with conditionsNotMet true, recorded as such: it did not act.
 */
export class GatewayExternalAdapter implements Connector {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;
  private readonly url: URL;
  private readonly keyId: string;
  private readonly lookup: EndpointAddressLookup;
  private readonly transport: ReleaseTransport;
  private readonly now: () => Date;
  private readonly serializer = new CanonicalSerializer();

  constructor(private readonly options: GatewayExternalAdapterOptions) {
    const { target } = options;
    const checked = checkEndpointUrl(target.endpointUrl);

    if (!checked.ok) {
      throw new Error(
        `External connector for "${target.capability}" has an endpoint Parmana will not release to: ${checked.reason}`,
      );
    }

    this.url = checked.url;
    this.connectorId = `ext-${target.capability}`;
    this.capabilities = connectorCapabilities([target.capability]);
    this.keyId = options.keyId ?? DEFAULT_KEY_ID;
    this.lookup = options.lookup ?? systemEndpointAddressLookup;
    this.transport = options.transport ?? createPinnedHttpsTransport();
    this.now = options.now ?? (() => new Date());
  }

  async execute(
    request: ConnectorRequest,
    context: ConnectorExecutionContext,
  ): Promise<ConnectorResponse> {
    const { target } = this.options;

    if (request.capability !== target.capability) {
      throw new Error(
        `External connector "${this.connectorId}" does not declare capability "${request.capability}".`,
      );
    }

    if (context.release === undefined) {
      throw new Error(
        `External connector "${this.connectorId}" refuses a request with no signed authorization behind it.`,
      );
    }

    const disallowed = Object.keys(request.parameters).filter(
      (name) => !target.allowedParameters.includes(name),
    );

    if (disallowed.length > 0) {
      throw new Error(
        `External connector "${this.connectorId}" refuses to forward parameter` +
          `${disallowed.length === 1 ? "" : "s"} ${disallowed.map((name) => `"${name}"`).join(", ")}: ` +
          `the registration allows only ${target.allowedParameters.length === 0 ? "none" : target.allowedParameters.join(", ")}.`,
      );
    }

    let addresses: readonly ResolvedAddress[];

    try {
      addresses = await resolvePublicEndpointAddresses(this.url, this.lookup);
    } catch (error) {
      if (error instanceof ExternalEndpointAddressError) {
        throw new Error(
          `External connector "${this.connectorId}" refuses to release: ${error.message}`,
          { cause: error },
        );
      }

      throw error;
    }

    const signed = await this.sign(request, context.release);

    const answer = await this.transport({
      url: this.url,
      addresses,
      body: JSON.stringify(signed),
      timeoutMs: Math.min(context.timeoutMs, target.timeoutMs),
    });

    return this.acceptAnswer(request, signed, answer);
  }

  private async sign(
    request: ConnectorRequest,
    release: NonNullable<ConnectorExecutionContext["release"]>,
  ): Promise<SignedExternalRelease> {
    const issuedAt = this.now();
    const conditions = release.conditions ?? [];

    // The release never outlives the facts it rests on: it expires at
    // the earliest condition's validUntil when that is sooner than the
    // usual 60 seconds.
    const expiresAt = Math.min(
      issuedAt.getTime() + EXTERNAL_RELEASE_TTL_MS,
      ...conditions.map((condition) => Date.parse(condition.validUntil)),
    );

    const body: ExternalRelease = {
      version: 1,
      connectorId: this.connectorId,
      audience: this.url.href,
      businessTransactionId: request.businessTransactionId,
      authorizationId: release.authorizationId,
      capability: request.capability,
      target: request.target,
      parameters: request.parameters,
      policy: {
        name: release.policy.name,
        version: release.policy.version,
        ...(release.policy.contentHash !== undefined
          ? { contentHash: release.policy.contentHash }
          : {}),
      },
      approvedBy: release.approvals.map((approval) => ({
        approverId: approval.approverId,
        keyId: approval.keyId,
        approvalId: approval.approvalId,
      })),
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      ...(conditions.length > 0 && {
        conditions: conditions.map((condition) => ({
          signalKey: condition.signalKey,
          source: condition.source,
          claim: condition.claim,
          subject: condition.subject,
          value: condition.value,
          validUntil: condition.validUntil,
        })),
      }),
    };

    const signer = this.options.signer ?? (await SignerBootstrap.create());
    const value = await signer.sign(
      this.keyId,
      this.serializer.serialize(body),
    );
    const { algorithm } = await signer.getMetadata(this.keyId);

    return {
      release: body,
      signature: { algorithm, keyId: this.keyId, value },
    };
  }

  private acceptAnswer(
    request: ConnectorRequest,
    signed: SignedExternalRelease,
    answer: ReleaseTransportResponse,
  ): ConnectorResponse {
    if (answer.status !== 200) {
      throw new Error(
        `External connector "${this.connectorId}" endpoint answered HTTP ${answer.status}; only 200 is accepted.`,
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(answer.body);
    } catch {
      throw new Error(
        `External connector "${this.connectorId}" endpoint answered with a body that is not JSON.`,
      );
    }

    if (!isPlainObject(body)) {
      throw new Error(
        `External connector "${this.connectorId}" endpoint answered with JSON that is not an object.`,
      );
    }

    const problems: string[] = [];

    if (body.businessTransactionId !== request.businessTransactionId) {
      problems.push("businessTransactionId does not match the release");
    }

    if (body.capability !== request.capability) {
      problems.push("capability does not match the release");
    }

    if (typeof body.success !== "boolean") {
      problems.push("success is not a boolean");
    }

    if (!isPlainObject(body.result)) {
      problems.push("result is not an object");
    } else if (
      Buffer.byteLength(JSON.stringify(body.result), "utf8") >
      EXTERNAL_RESULT_MAX_BYTES
    ) {
      problems.push(`result is larger than ${EXTERNAL_RESULT_MAX_BYTES} bytes`);
    }

    if (body.executedAt !== undefined && typeof body.executedAt !== "string") {
      problems.push("executedAt is not a string");
    }

    if (
      body.conditionsNotMet !== undefined &&
      (body.conditionsNotMet !== true || body.success !== false)
    ) {
      problems.push(
        "conditionsNotMet, when present, must be true with success false",
      );
    }

    if (problems.length > 0) {
      throw new Error(
        `External connector "${this.connectorId}" refuses the endpoint's answer: ${problems.join("; ")}.`,
      );
    }

    return {
      success: body.success as boolean,
      metadata: {
        endpointUrl: signed.release.audience,
        releaseIssuedAt: signed.release.issuedAt,
        result: body.result,
        ...(typeof body.executedAt === "string"
          ? { executedAt: body.executedAt }
          : {}),
        // RFC-0023 phase 4: the endpoint did not act, because a condition
        // the release rests on no longer held in its records.
        ...(body.conditionsNotMet === true ? { conditionsNotMet: true } : {}),
        // ADR-0013, open question 3: the endpoint may sign its answer.
        // Recorded as sent, not verified in version 1.
        ...(isPlainObject(body.signature)
          ? { endpointSignature: body.signature }
          : {}),
      },
    };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface PinnedHttpsTransportOptions {
  /**
   * The request function: https.request in production. Tests pass
   * http.request to reach a local server without a certificate; the
   * pinning, redirect and size rules are the same.
   */
  readonly request?: typeof https.request | typeof http.request;
  readonly maxResponseBytes?: number;
}

/**
 * Sends a release with POST and returns the status and body. It connects
 * only to the already checked addresses, in order: the host name is used
 * for the Host header and TLS server name only, never resolved again. If
 * a connection to one address cannot be established, the next is tried
 * (G-83); once a connection is established, nothing is retried, so a
 * release is never sent twice. Redirects are not followed (a 3xx is
 * returned as it is, and refused by the adapter). The body is read up to
 * maxResponseBytes, and the whole exchange, across every address tried,
 * is bounded by timeoutMs.
 */
export function createPinnedHttpsTransport(
  options: PinnedHttpsTransportOptions = {},
): ReleaseTransport {
  const send = options.request ?? https.request;
  const maxBytes = options.maxResponseBytes ?? EXTERNAL_ANSWER_MAX_BYTES;

  return ({ url, addresses, body, timeoutMs }) =>
    new Promise<ReleaseTransportResponse>((resolve, reject) => {
      if (addresses.length === 0) {
        reject(new Error("No checked address to connect to."));
        return;
      }

      let settled = false;
      let current: { destroy(): void } | undefined;

      const finish = (
        error: Error | undefined,
        value?: ReleaseTransportResponse,
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error !== undefined) reject(error);
        else resolve(value as ReleaseTransportResponse);
      };

      const timer = setTimeout(() => {
        current?.destroy();
        finish(new Error(`The endpoint did not answer within ${timeoutMs}ms.`));
      }, timeoutMs);

      const attempt = (index: number) => {
        const pinned = addresses[index]!;
        let connected = false;

        const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
          if (lookupOptions.all === true) {
            (
              callback as unknown as (
                error: null,
                addresses: { address: string; family: number }[],
              ) => void
            )(null, [{ address: pinned.address, family: pinned.family }]);
          } else {
            callback(null, pinned.address, pinned.family);
          }
        };

        const outgoing = send(
          {
            hostname: url.hostname,
            port: url.port === "" ? 443 : Number(url.port),
            path: `${url.pathname}${url.search}`,
            method: "POST",
            servername: url.hostname,
            lookup,
            agent: false,
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body, "utf8"),
              Accept: "application/json",
            },
          },
          (response) => {
            const chunks: Buffer[] = [];
            let size = 0;

            response.on("data", (chunk: Buffer) => {
              size += chunk.length;

              if (size > maxBytes) {
                response.destroy();
                outgoing.destroy();
                finish(
                  new Error(
                    `The endpoint's answer is larger than ${maxBytes} bytes.`,
                  ),
                );
                return;
              }

              chunks.push(chunk);
            });

            response.on("end", () =>
              finish(undefined, {
                status: response.statusCode ?? 0,
                body: Buffer.concat(chunks).toString("utf8"),
              }),
            );

            response.on("error", (error) => finish(error));
          },
        );

        current = outgoing;

        outgoing.on("socket", (socket) => {
          socket.once("connect", () => {
            connected = true;
          });
        });

        outgoing.on("error", (error) => {
          if (settled) return;
          //
          // Only a connection that was never made is retried on the
          // next checked address: once connected, the endpoint may have
          // received the release, and sending it again could act twice.
          //
          if (!connected && index + 1 < addresses.length) {
            attempt(index + 1);
            return;
          }
          finish(error);
        });

        outgoing.end(body);
      };

      attempt(0);
    });
}
