import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  buildPostmanCollection,
  POSTMAN_COLLECTION_PATH,
  serializePostmanCollection,
} from "./postman/buildPostmanCollection.js";

/**
 * Regenerates postman/parmana.postman_collection.json from
 * openapi/openapi.bundled.yaml.
 *
 * Usage: npm run generate:postman
 */
const collection = buildPostmanCollection();
const folders = collection.item as Array<{ item: unknown[] }>;
const requests = folders.reduce(
  (total, folder) => total + folder.item.length,
  0,
);

mkdirSync(dirname(POSTMAN_COLLECTION_PATH), { recursive: true });
writeFileSync(POSTMAN_COLLECTION_PATH, serializePostmanCollection(collection));

console.log(
  `postman collection: ${folders.length} folders, ${requests} requests`,
);
