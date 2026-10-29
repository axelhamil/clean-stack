import { randomUUID } from "node:crypto";
import { Result } from "./result";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const RANDOM_BITS = 74n;
const RANDOM_MAX = (1n << RANDOM_BITS) - 1n;
const RAND_B_BITS = 62n;
const RAND_B_MASK = (1n << RAND_B_BITS) - 1n;
const VARIANT_BITS = 0b10n << RAND_B_BITS;

let lastTimestamp = -1;
let lastRandom = 0n;

function freshRandom(): bigint {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);

  let random = 0n;
  for (const byte of bytes) random = (random << 8n) | BigInt(byte);

  return random & RANDOM_MAX;
}

function advanceMonotonicState(now: number): void {
  if (now > lastTimestamp) {
    lastTimestamp = now;
    lastRandom = freshRandom();
    return;
  }

  if (lastRandom < RANDOM_MAX) {
    lastRandom += 1n;
    return;
  }

  lastTimestamp += 1;
  lastRandom = freshRandom();
}

export function uuidv7(): string {
  advanceMonotonicState(Date.now());

  const timestampHex = lastTimestamp.toString(16).padStart(12, "0");
  const randAHex = (lastRandom >> RAND_B_BITS).toString(16).padStart(3, "0");
  const randBHex = (VARIANT_BITS | (lastRandom & RAND_B_MASK)).toString(16);

  return [
    timestampHex.slice(0, 8),
    timestampHex.slice(8, 12),
    `7${randAHex}`,
    randBHex.slice(0, 4),
    randBHex.slice(4, 16),
  ].join("-");
}

export class UUID<T extends string | number> {
  protected readonly _value: T;

  constructor(value?: T) {
    this._value = value ?? (uuidv7() as T);
  }

  public static parse<Id extends UUID<string>>(
    this: new (
      value: string,
    ) => Id,
    raw: string,
  ): Result<Id> {
    const normalized = raw.trim().toLowerCase();
    if (!UUID_PATTERN.test(normalized)) return Result.fail(`"${raw}" is not a uuid`);

    return Result.ok(new this(normalized));
  }

  public get value(): T {
    return this._value;
  }

  equals(id?: UUID<T>): boolean {
    if (id === null || id === undefined) {
      return false;
    }
    if (!(id instanceof this.constructor)) {
      return false;
    }
    return id.value === this.value;
  }
}

export function randomUuidV4(): string {
  return randomUUID();
}
