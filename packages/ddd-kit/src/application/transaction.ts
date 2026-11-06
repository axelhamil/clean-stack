export interface IUnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}
