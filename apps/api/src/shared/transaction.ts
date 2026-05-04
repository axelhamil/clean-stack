import type { Transaction } from "@packages/drizzle";

// Type-only alias. Application layer threads `ITransaction` through ports +
// use cases without runtime coupling to the provider; swapping Drizzle for
// another ORM = change this single line. Same trade-off as Nikolovlazar's
// "Clean Architecture in Next.js" pattern: maximum type safety, single
// swap-point, zero cast in adapters (`tx ?? db` is natively typed).
export type ITransaction = Transaction;
