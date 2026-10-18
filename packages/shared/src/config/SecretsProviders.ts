export const SecretsProviders = {
  ENV: "env",
  AWS_SECRETS_MANAGER: "aws-secrets-manager",
} as const;

export type SecretsProvider =
  (typeof SecretsProviders)[keyof typeof SecretsProviders];
