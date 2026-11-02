import { type Mock, mock } from "bun:test";

export type PortMock<T> = T & {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : T[K];
};

const READ_BY_THE_RUNTIME = new Set(["then", "asymmetricMatch", "toJSON", "nodeType", "$$typeof"]);

export function mockPort<T extends object>(): PortMock<T> {
  const mocks = new Map<string, Mock<(...args: unknown[]) => unknown>>();

  return new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property === "symbol" || READ_BY_THE_RUNTIME.has(property)) return undefined;

        const existing = mocks.get(property);
        if (existing) return existing;

        const created = mock();
        mocks.set(property, created);

        return created;
      },
    },
  ) as PortMock<T>;
}
