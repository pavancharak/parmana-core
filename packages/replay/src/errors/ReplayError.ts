export class ReplayError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "ReplayError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
