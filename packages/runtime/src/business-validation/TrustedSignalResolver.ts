import {
  CanonicalSerializer,
  CryptoBootstrap,
  TrustRecordHasher,
} from "@parmana/crypto";
import type { Policy, SignalSourceDeclaration } from "@parmana/policy";
import {
  BusinessValidationStatus,
  type BusinessValidationAssessment,
  type BusinessValidationFailure,
  type JsonValue,
  type TrustedSignal,
} from "@parmana/shared";

import type {
  BusinessSignalSourceAnswer,
  BusinessSignalSourceRegistry,
} from "./BusinessSignalSource.js";

/** How old a source's answer may be when a policy sets no maxAgeSeconds. */
export const DEFAULT_SIGNAL_MAX_AGE_SECONDS = 300;

/** How long one source may take to answer before it counts as unavailable. */
export const DEFAULT_SOURCE_TIMEOUT_MS = 10_000;

/** How far in the future a source's observedAt may be (clock skew). */
const MAX_CLOCK_SKEW_MS = 60_000;

/**
 * Which failure a request reports first when several facts fail. Every
 * one refuses the request; the order only picks the headline status.
 */
const FAILURE_ORDER: readonly BusinessValidationStatus[] = [
  BusinessValidationStatus.SOURCE_UNAVAILABLE,
  BusinessValidationStatus.CONFLICTING_DATA,
  BusinessValidationStatus.MISSING_DATA,
  BusinessValidationStatus.VALIDATION_EXPIRED,
  BusinessValidationStatus.INVALID,
];

export interface TrustedSignalResolution {
  readonly assessment: BusinessValidationAssessment;

  /**
   * The established values, by signal key, for the policy to evaluate.
   * Empty unless the assessment is VALID.
   */
  readonly trustedValues: Readonly<Record<string, JsonValue>>;
}

export interface TrustedSignalRequest {
  readonly policy: Policy;
  readonly action: string;
  readonly businessTransactionId: string;
  readonly intent: {
    readonly target?: string;
    readonly parameters?: Readonly<Record<string, unknown>>;
  };
  /** What the caller proposed, compared with each established value. */
  readonly proposedSignals: Readonly<Record<string, JsonValue>>;
}

/**
 * Establishes the business facts a policy declares in signalSources
 * (RFC-0023). For each one it asks the declared source about the
 * business object at the declared Intent path, never using the
 * caller's value, and records the answer as a TrustedSignal. It then
 * compares the caller's proposed value, when there is one, with the
 * established value.
 *
 * Fails closed. VALID only when every declared fact was established,
 * is fresh, and matches whatever the caller proposed. No signal
 * sources declared is NOT_EVALUATED, never VALID.
 */
export class TrustedSignalResolver {
  private readonly hasher = new TrustRecordHasher(CryptoBootstrap.create());
  private readonly serializer = new CanonicalSerializer();

  constructor(
    private readonly registry: BusinessSignalSourceRegistry | undefined,
    private readonly options: {
      readonly now?: () => Date;
      readonly timeoutMs?: number;
      readonly newId?: () => string;
    } = {},
  ) {}

  async resolve(
    request: TrustedSignalRequest,
  ): Promise<TrustedSignalResolution> {
    const declarations = Object.entries(
      request.policy.signalSources ?? {},
    ).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    if (declarations.length === 0) {
      return {
        assessment: {
          status: BusinessValidationStatus.NOT_EVALUATED,
          reason: "The policy declares no business facts to establish.",
        },
        trustedValues: {},
      };
    }

    const results = await Promise.all(
      declarations.map(([signalKey, declaration]) =>
        this.resolveOne(request, signalKey, declaration),
      ),
    );

    const signals = results.flatMap((result) =>
      result.signal !== undefined ? [result.signal] : [],
    );
    const failures = results.flatMap((result) =>
      result.failure !== undefined ? [result.failure] : [],
    );

    if (failures.length > 0) {
      const status = FAILURE_ORDER.find((candidate) =>
        failures.some((failure) => failure.status === candidate),
      ) as BusinessValidationStatus;

      return {
        assessment: {
          status,
          reason: failures.map((failure) => failure.reason).join(" "),
          signals,
          failures,
        },
        trustedValues: {},
      };
    }

    return {
      assessment: {
        status: BusinessValidationStatus.VALID,
        reason: `Every business fact the policy needs (${signals
          .map((signal) => signal.signalKey)
          .join(
            ", ",
          )}) was established by its source and matches the proposal.`,
        signals,
      },
      trustedValues: Object.fromEntries(
        signals.map((signal) => [signal.signalKey, signal.observedValue]),
      ),
    };
  }

  private async resolveOne(
    request: TrustedSignalRequest,
    signalKey: string,
    declaration: SignalSourceDeclaration,
  ): Promise<{ signal?: TrustedSignal; failure?: BusinessValidationFailure }> {
    const fail = (status: BusinessValidationStatus, reason: string) => ({
      failure: { signalKey, status, reason },
    });

    const rawSubject = readIntentPath(request.intent, declaration.subject);

    if (
      (typeof rawSubject !== "string" && typeof rawSubject !== "number") ||
      String(rawSubject).trim() === ""
    ) {
      return fail(
        BusinessValidationStatus.MISSING_DATA,
        `${signalKey}: the request has no business object at ${declaration.subject}.`,
      );
    }

    const subject = String(rawSubject);
    let source;

    try {
      source = await this.registry?.get(declaration.source);
    } catch (error) {
      return fail(
        BusinessValidationStatus.SOURCE_UNAVAILABLE,
        `${signalKey}: source "${declaration.source}" could not be looked up (${
          error instanceof Error ? error.message : String(error)
        }).`,
      );
    }

    if (source === undefined) {
      return fail(
        BusinessValidationStatus.SOURCE_UNAVAILABLE,
        `${signalKey}: source "${declaration.source}" is not registered.`,
      );
    }

    let answer: BusinessSignalSourceAnswer;

    try {
      answer = await this.withTimeout(
        source.resolve({
          signalKey,
          claim: declaration.claim,
          subject,
          subjectPath: declaration.subject,
          action: request.action,
          businessTransactionId: request.businessTransactionId,
        }),
        declaration.source,
      );
    } catch (error) {
      return fail(
        BusinessValidationStatus.SOURCE_UNAVAILABLE,
        `${signalKey}: source "${declaration.source}" did not answer (${
          error instanceof Error ? error.message : String(error)
        }).`,
      );
    }

    if (answer.kind === "not_found") {
      return fail(
        BusinessValidationStatus.MISSING_DATA,
        `${signalKey}: source "${declaration.source}" has no ${declaration.claim} for ${subject}: ${answer.reason}`,
      );
    }

    if (answer.kind === "conflicting") {
      return fail(
        BusinessValidationStatus.CONFLICTING_DATA,
        `${signalKey}: source "${declaration.source}" holds conflicting ${declaration.claim} for ${subject}: ${answer.reason}`,
      );
    }

    if (answer.kind !== "observed") {
      return fail(
        BusinessValidationStatus.SOURCE_UNAVAILABLE,
        `${signalKey}: source "${declaration.source}" gave an answer of unknown kind.`,
      );
    }

    if (
      typeof answer.sourceIdentity !== "string" ||
      answer.sourceIdentity.trim() === "" ||
      !(answer.observedAt instanceof Date) ||
      Number.isNaN(answer.observedAt.getTime()) ||
      answer.value === undefined
    ) {
      return fail(
        BusinessValidationStatus.SOURCE_UNAVAILABLE,
        `${signalKey}: source "${declaration.source}" gave an incomplete answer (value, identity and observation time are required).`,
      );
    }

    const declaredType = request.policy.signalsSchema?.[signalKey];

    if (
      declaredType !== undefined &&
      !hasJsonType(answer.value, declaredType)
    ) {
      return fail(
        BusinessValidationStatus.MISSING_DATA,
        `${signalKey}: source "${declaration.source}" returned ${describeType(answer.value)}, but the policy declares ${declaredType}.`,
      );
    }

    const now = (this.options.now ?? (() => new Date()))();
    const maxAgeMs =
      (declaration.maxAgeSeconds ?? DEFAULT_SIGNAL_MAX_AGE_SECONDS) * 1000;

    if (answer.observedAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) {
      return fail(
        BusinessValidationStatus.SOURCE_UNAVAILABLE,
        `${signalKey}: source "${declaration.source}" reports an observation time in the future.`,
      );
    }

    const expiresAt = Math.min(
      answer.observedAt.getTime() + maxAgeMs,
      answer.validUntil !== undefined &&
        !Number.isNaN(answer.validUntil.getTime())
        ? answer.validUntil.getTime()
        : Number.POSITIVE_INFINITY,
    );

    if (expiresAt <= now.getTime()) {
      return fail(
        BusinessValidationStatus.VALIDATION_EXPIRED,
        `${signalKey}: the answer from source "${declaration.source}" is no longer current.`,
      );
    }

    const unsigned = {
      signalId: (this.options.newId ?? (() => crypto.randomUUID()))(),
      signalKey,
      source: declaration.source,
      sourceIdentity: answer.sourceIdentity,
      claim: declaration.claim,
      subject,
      subjectPath: declaration.subject,
      observedValue: answer.value,
      observedAt: answer.observedAt,
      validUntil: new Date(expiresAt),
      action: request.action,
      businessTransactionId: request.businessTransactionId,
      verificationStatus: "VERIFIED" as const,
    };

    const signal: TrustedSignal = {
      ...unsigned,
      integrityProof: {
        algorithm: "sha256",
        digest: await this.hasher.hash(unsigned),
        ...(answer.sourceProof !== undefined && {
          sourceProof: answer.sourceProof,
          ...(answer.sourceKeyId !== undefined && {
            sourceKeyId: answer.sourceKeyId,
          }),
          sourceProofVerified: answer.sourceProofVerified === true,
        }),
      },
    };

    if (
      Object.prototype.hasOwnProperty.call(
        request.proposedSignals,
        signalKey,
      ) &&
      !this.sameJson(request.proposedSignals[signalKey], answer.value)
    ) {
      return {
        signal,
        failure: {
          signalKey,
          status: BusinessValidationStatus.INVALID,
          reason: `${signalKey}: the request proposed ${JSON.stringify(
            request.proposedSignals[signalKey],
          )}, but source "${declaration.source}" reports ${JSON.stringify(answer.value)} for ${subject}.`,
        },
      };
    }

    return { signal };
  }

  private sameJson(a: unknown, b: unknown): boolean {
    const left = this.serializer.serialize(a);
    const right = this.serializer.serialize(b);
    return (
      left.length === right.length && left.every((byte, i) => byte === right[i])
    );
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    source: string,
  ): Promise<T> {
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_SOURCE_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(`no answer from "${source}" within ${timeoutMs} ms`),
              ),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

function readIntentPath(
  intent: TrustedSignalRequest["intent"],
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, intent);
}

function hasJsonType(value: JsonValue, declared: string): boolean {
  switch (declared) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    default:
      return true;
  }
}

function describeType(value: JsonValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}
