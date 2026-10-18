import { PolicyError } from "./PolicyError.js";

export class PolicyNotFoundError extends PolicyError {
  constructor(name: string, version: string) {
    super(`Policy '${name}' version '${version}' was not found.`);

    this.name = "PolicyNotFoundError";
  }
}
