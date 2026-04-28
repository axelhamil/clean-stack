export type QueryHandler<
  TResponse,
  TArgs extends readonly unknown[] = readonly unknown[],
> = (...args: TArgs) => Promise<TResponse>;
