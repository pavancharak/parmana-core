import type { JsonValue } from "@parmana/shared";

/**
 * What the runtime asks a business system about one fact (RFC-0023).
 */
export interface BusinessSignalQuery {
  /** The policy signal the answer will supply, such as "refundEligible". */
  readonly signalKey: string;

  /** What to establish, as the policy declares it, such as "refund.eligible". */
  readonly claim: string;

  /** The business object, read from the Intent, such as "ORD-1001". */
  readonly subject: string;

  /** Where in the Intent the subject was read. */
  readonly subjectPath: string;

  /** The action and transaction the fact is needed for. */
  readonly action: string;
  readonly businessTransactionId: string;
}

/**
 * A source's answer. Only `observed` can become a TrustedSignal.
 * A source that cannot answer at all throws, and the runtime records
 * SOURCE_UNAVAILABLE.
 */
export type BusinessSignalSourceAnswer =
  | {
      readonly kind: "observed";
      readonly value: JsonValue;
      /** Who answered, such as the endpoint or account the source used. */
      readonly sourceIdentity: string;
      /** When the source established the value. */
      readonly observedAt: Date;
      /** Until when the source says the value holds, if it says. */
      readonly validUntil?: Date;
      /** The source's own proof of its answer, verbatim, if it has one. */
      readonly sourceProof?: string;
      /** The registered key the source signed with. */
      readonly sourceKeyId?: string;
      /**
       * True only when the implementation verified sourceProof against
       * the source's registered key. Never set it for an unchecked proof.
       */
      readonly sourceProofVerified?: boolean;
    }
  | {
      /** The source has no such fact for this subject. */
      readonly kind: "not_found";
      readonly reason: string;
    }
  | {
      /** The source holds contradictory facts for this subject. */
      readonly kind: "conflicting";
      readonly reason: string;
    };

/**
 * A business system that can establish facts for policies, such as an
 * order system answering whether a refund is eligible. Implementations
 * must read the fact from the system that owns it, never from the
 * request being decided.
 */
export interface BusinessSignalSource {
  readonly name: string;
  resolve(query: BusinessSignalQuery): Promise<BusinessSignalSourceAnswer>;
}

/**
 * The sources the runtime may ask, by the name a policy's signalSources
 * uses.
 */
export interface BusinessSignalSourceRegistry {
  /**
   * The source registered under this name, or undefined. May be async,
   * for a registry read from storage; a lookup that throws is treated as
   * SOURCE_UNAVAILABLE.
   */
  get(
    name: string,
  ):
    | BusinessSignalSource
    | undefined
    | Promise<BusinessSignalSource | undefined>;
}

/**
 * A fixed set of sources, configured at startup.
 */
export class StaticBusinessSignalSourceRegistry implements BusinessSignalSourceRegistry {
  private readonly sources = new Map<string, BusinessSignalSource>();

  constructor(sources: readonly BusinessSignalSource[] = []) {
    for (const source of sources) {
      if (this.sources.has(source.name)) {
        throw new Error(
          `Business signal source "${source.name}" is registered twice.`,
        );
      }
      this.sources.set(source.name, source);
    }
  }

  get(name: string): BusinessSignalSource | undefined {
    return this.sources.get(name);
  }
}
