import { StorageFactory } from "@parmana/storage";
import type { StorageProvider } from "@parmana/storage";

/**
 * Shared storage provider, constructed lazily on first repository use
 * rather than as a module-scope side effect (G-15,
 * docs/VERIFICATION-GAPS.md). Importing this module — which every
 * packages/api test file transitively does via ../src/application.js —
 * must never itself construct a live Supabase client; only an actual
 * repository call should.
 */
let storage: StorageProvider | undefined;

function getStorage(): StorageProvider {
  storage ??= StorageFactory.createFromEnvironment();

  return storage;
}

/**
 * Wraps a repository accessor in a Proxy so the exported binding stays
 * a plain repository instance at every call site — no function-call
 * change required anywhere storage is used — while the real repository
 * (and the storage provider behind it) isn't constructed until the
 * first property access on it.
 */
function lazyRepository<T extends object>(
  select: (provider: StorageProvider) => T,
): T {
  return new Proxy({} as T, {
    get(_target, property, receiver) {
      const repository = select(getStorage());

      return Reflect.get(repository, property, receiver);
    },
  });
}

/**
 * Shared repositories.
 *
 * Every API route uses these instances.
 */
export const businessTransactionRepository = lazyRepository(
  (provider) => provider.businessTransactions,
);

export const executionTrustRecordRepository = lazyRepository(
  (provider) => provider.trustRecords,
);

export const refusalRecordRepository = lazyRepository(
  (provider) => provider.refusalRecords,
);

export const executionIntentRepository = lazyRepository(
  (provider) => provider.executionIntents,
);

export const pendingPolicyChangeRepository = lazyRepository(
  (provider) => provider.pendingPolicyChanges,
);

export const policyChangeApprovalRecordRepository = lazyRepository(
  (provider) => provider.policyChangeApprovalRecords,
);

export const handbookDownloadLeadRepository = lazyRepository(
  (provider) => provider.handbookDownloadLeads,
);

export const approvalIssuerRepository = lazyRepository(
  (provider) => provider.approvalIssuers,
);

export const externalConnectorRepository = lazyRepository(
  (provider) => provider.externalConnectors,
);

export const businessSignalSourceRepository = lazyRepository(
  (provider) => provider.businessSignalSources,
);

export const authorityGrantRepository = lazyRepository(
  (provider) => provider.authorityGrants,
);
