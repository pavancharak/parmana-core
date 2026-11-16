import { randomUUID } from "node:crypto";

import {
  AuthorityType,
  BusinessTransactionStatus,
  type Authority,
  type Authorization,
  type BusinessTransaction,
  type Intent,
  type TransactionMetadata,
} from "@parmana/shared";

/**
 * Completes a transaction that a tutorial writes as a literal or as a JSON
 * file. Those files hold what the tutorial varies (the id, policy, intent and
 * signals). The bookkeeping the runtime requires is filled in here, with the
 * same kinds of values the other tutorials use: a service authority named
 * "tutorial-agent", an authorization for a tutorial, and a fresh intent id.
 *
 * A value the caller sets always wins.
 */
type CompletableIntent = Omit<
  Intent,
  "intentId" | "authorizationId" | "createdAt"
> &
  Partial<Pick<Intent, "intentId" | "authorizationId" | "createdAt">>;

export type TransactionInput = Omit<
  BusinessTransaction,
  | "metadata"
  | "authority"
  | "authorization"
  | "intent"
  | "status"
  | "createdAt"
  | "signals"
  | "policy"
> & {
  readonly policy: Omit<BusinessTransaction["policy"], "schemaVersion"> &
    Partial<Pick<BusinessTransaction["policy"], "schemaVersion">>;
} & Partial<
    Pick<
      BusinessTransaction,
      | "metadata"
      | "authority"
      | "authorization"
      | "status"
      | "createdAt"
      | "signals"
    >
  > & {
    readonly intent: CompletableIntent;
  };

export function withRequiredFields(
  input: TransactionInput,
): BusinessTransaction {
  const now = new Date();

  const authority: Authority = input.authority ?? {
    authorityId: randomUUID(),
    authorityType: AuthorityType.SERVICE,
    principalId: "tutorial-agent",
    displayName: "tutorial-agent",
    issuedAt: now,
  };

  const authorization: Authorization = input.authorization ?? {
    authorizationId: randomUUID(),
    authorityId: authority.authorityId,
    purpose: "Tutorial",
    issuedAt: now,
  };

  const metadata: TransactionMetadata = input.metadata ?? {
    businessTransactionId: input.businessTransactionId,
    correlationId: randomUUID(),
    submittedBy: authority.principalId,
    submittedAt: now,
  };

  const intent: Intent = {
    intentId: input.intent.intentId ?? randomUUID(),
    authorizationId:
      input.intent.authorizationId ?? authorization.authorizationId,
    createdAt: input.intent.createdAt ?? now,
    action: input.intent.action,
    target: input.intent.target,
    parameters: input.intent.parameters,
  };

  return {
    ...input,
    // Every policy file in policies/ declares schemaVersion "1.0.0".
    policy: {
      ...input.policy,
      schemaVersion: input.policy.schemaVersion ?? "1.0.0",
    },
    signals: input.signals ?? {},
    status: input.status ?? BusinessTransactionStatus.RECEIVED,
    createdAt: input.createdAt ?? now,
    metadata,
    authority,
    authorization,
    intent,
  };
}

/**
 * Converts a transaction read from a JSON fixture into the typed input that
 * withRequiredFields completes. JSON has no enums and no dates, so this checks
 * the enum values and turns ISO strings into Date objects. A fixture field
 * that the schema does not have (metadata.createdBy and metadata.createdAt)
 * is dropped, and authorization.authorizedAt is read as issuedAt.
 */
export function fromFixture(raw: Record<string, unknown>): TransactionInput {
  const authority = raw.authority as Record<string, unknown> | undefined;
  const authorization = raw.authorization as
    Record<string, unknown> | undefined;
  const metadata = raw.metadata as Record<string, unknown> | undefined;
  const intent = raw.intent as Record<string, unknown>;
  const policy = raw.policy as {
    name: string;
    version: string;
    schemaVersion?: string;
  };

  const authorityType = authority?.authorityType;
  if (
    authority !== undefined &&
    !(Object.values(AuthorityType) as string[]).includes(String(authorityType))
  ) {
    throw new Error(
      `Fixture authorityType is not an AuthorityType: ${String(authorityType)}`,
    );
  }
  const status = String(raw.status ?? BusinessTransactionStatus.RECEIVED);
  if (
    !(Object.values(BusinessTransactionStatus) as string[]).includes(status)
  ) {
    throw new Error(
      `Fixture status is not a BusinessTransactionStatus: ${status}`,
    );
  }

  return {
    businessTransactionId: String(raw.businessTransactionId),
    policy,
    intent: {
      ...(intent as {
        action: string;
        target: string;
        parameters: Record<string, unknown>;
      }),
      ...(typeof intent.intentId === "string"
        ? { intentId: intent.intentId }
        : {}),
      ...(typeof intent.authorizationId === "string"
        ? { authorizationId: intent.authorizationId }
        : {}),
      ...(typeof intent.createdAt === "string"
        ? { createdAt: new Date(intent.createdAt) }
        : {}),
    },
    ...(metadata !== undefined ? { metadata: fixtureMetadata(metadata) } : {}),
    ...(authority !== undefined
      ? {
          authority: {
            ...(authority as Omit<Authority, "authorityType" | "issuedAt">),
            authorityType: authorityType as AuthorityType,
            issuedAt: new Date(String(authority.issuedAt)),
          },
        }
      : {}),
    ...(authorization !== undefined
      ? {
          authorization: {
            authorizationId: String(authorization.authorizationId),
            authorityId: String(authorization.authorityId),
            purpose: String(authorization.purpose),
            issuedAt: new Date(
              String(authorization.issuedAt ?? authorization.authorizedAt),
            ),
          },
        }
      : {}),
    status: status as BusinessTransactionStatus,
    createdAt: new Date(String(raw.createdAt)),
    signals: (raw.signals ?? {}) as Record<string, unknown>,
  };
}

const METADATA_STRING_FIELDS = [
  "businessTransactionId",
  "correlationId",
  "tenantId",
  "sourceSystem",
  "submittedBy",
  "grantedCapability",
] as const;

function fixtureMetadata(
  metadata: Record<string, unknown>,
): TransactionMetadata {
  const fields: Partial<
    Record<(typeof METADATA_STRING_FIELDS)[number], string>
  > = {};
  for (const key of METADATA_STRING_FIELDS) {
    const value = metadata[key];
    if (typeof value === "string") fields[key] = value;
  }
  return {
    businessTransactionId: String(metadata.businessTransactionId),
    ...fields,
    ...(typeof metadata.submittedAt === "string"
      ? { submittedAt: new Date(metadata.submittedAt) }
      : {}),
  };
}
