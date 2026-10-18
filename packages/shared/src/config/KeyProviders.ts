export const KeyProviders = {
  LOCAL: "local",
  AWS_KMS: "aws-kms",
  AZURE_KEY_VAULT: "azure-key-vault",
  GCP_KMS: "gcp-kms",
  HSM: "hsm",
} as const;

export type KeyProvider = (typeof KeyProviders)[keyof typeof KeyProviders];
