import { createHash } from "node:crypto";

import { CanonicalSerializer } from "@parmana/crypto";

const serializer = new CanonicalSerializer();

export function bindingHash(value: unknown): string {
  return createHash("sha256").update(serializer.serialize(value)).digest("hex");
}
