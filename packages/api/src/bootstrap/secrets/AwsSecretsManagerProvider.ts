import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

import type { SecretsProvider } from "./SecretsProvider.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  readonly value: string;
  readonly fetchedAt: number;
}

/**
 * AWS Secrets Manager–backed SecretsProvider (ADR-0009).
 *
 * `reference` is the Secrets Manager secret's name or ARN.
 * SecretString-only: this codebase's connector credentials are always
 * plain strings (a bearer token, a shared secret), never
 * SecretBinary. Fetched values are cached in-memory for
 * CACHE_TTL_MS -- reduces API calls without ever writing a secret to
 * disk; the cache lives only in process memory and is gone on
 * restart.
 *
 * Credentials: no static AWS access keys. Same resolution as
 * @parmana/crypto's KmsSigner -- if AWS_ROLE_ARN is set, exchanges
 * Vercel's OIDC token for short-lived STS credentials via
 * @vercel/oidc-aws-credentials-provider; otherwise defers to the AWS
 * SDK's own default credential provider chain.
 */
export class AwsSecretsManagerProvider implements SecretsProvider {
  private readonly cache = new Map<string, CacheEntry>();

  private constructor(private readonly client: SecretsManagerClient) {}

  /**
   * Async factory, not a plain constructor: resolving credentials may
   * require a dynamic `import()` of the optional
   * @vercel/oidc-aws-credentials-provider peer dependency (this
   * package is ESM; there is no synchronous `require()` to load it
   * lazily). Mirrors KmsSigner.create() exactly.
   */
  static async create(
    region: string = requireRegion(),
  ): Promise<AwsSecretsManagerProvider> {
    const credentials = await resolveCredentials();

    return new AwsSecretsManagerProvider(
      new SecretsManagerClient({
        region,
        ...(credentials !== undefined ? { credentials } : {}),
      }),
    );
  }

  async getSecret(reference: string): Promise<string> {
    const cached = this.cache.get(reference);

    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.value;
    }

    const response = await this.client.send(
      new GetSecretValueCommand({ SecretId: reference }),
    );

    if (typeof response.SecretString !== "string") {
      throw new Error(
        `Secrets Manager secret "${reference}" has no SecretString value ` +
          "(binary secrets are not supported).",
      );
    }

    this.cache.set(reference, {
      value: response.SecretString,
      fetchedAt: Date.now(),
    });

    return response.SecretString;
  }
}

function requireRegion(): string {
  const region = process.env.AWS_REGION;

  if (!region) {
    throw new Error("AwsSecretsManagerProvider requires AWS_REGION to be set.");
  }

  return region;
}

/**
 * Identical resolution strategy to KmsSigner's own resolveCredentials()
 * -- see that function's doc comment for the full reasoning.
 */
async function resolveCredentials(): Promise<
  | ReturnType<
      Awaited<
        typeof import("@vercel/oidc-aws-credentials-provider")
      >["awsCredentialsProvider"]
    >
  | undefined
> {
  const roleArn = process.env.AWS_ROLE_ARN;

  if (!roleArn) {
    return undefined;
  }

  const { awsCredentialsProvider } =
    await import("@vercel/oidc-aws-credentials-provider");

  return awsCredentialsProvider({ roleArn });
}
