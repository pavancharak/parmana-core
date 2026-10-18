export class StorageError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "StorageError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
