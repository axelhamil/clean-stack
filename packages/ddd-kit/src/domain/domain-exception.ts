export class DomainException extends Error {
  constructor(
    public readonly message: string,
    public readonly options?: ErrorOptions,
    public readonly code?: string,
  ) {
    super(message, options);
  }
}
