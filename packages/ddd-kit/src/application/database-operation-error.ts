export class DatabaseOperationError extends Error {
  constructor(
    public readonly message: string,
    public readonly options: ErrorOptions,
  ) {
    super(message, options);
  }
}
