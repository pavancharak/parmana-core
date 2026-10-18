/**
 * Supported storage providers.
 */
export type StorageProviderType = "memory" | "supabase" | "postgres" | "sqlite";

/**
 * Storage configuration.
 */
export interface StorageConfiguration {
  /**
   * Selected storage provider.
   */
  readonly provider: StorageProviderType;
}
