import { randomUUID } from "node:crypto";

export interface IdGenerator {
  generate(): string;
}

export class RandomIdGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}
