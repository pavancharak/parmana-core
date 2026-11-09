import { MemoryStorageProvider } from "../../src/memory/MemoryStorageProvider.js";

import { runStorageProviderContract } from "./storage-provider.contract.js";

runStorageProviderContract(
  "MemoryStorageProvider",
  () => new MemoryStorageProvider(),
);
