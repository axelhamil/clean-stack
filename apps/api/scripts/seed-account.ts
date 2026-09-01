/**
 * The account `pnpm --filter api db:seed` creates, and the target every
 * `check-*.ts` script that needs a real user resolves against.
 *
 * Single source of truth on purpose: the seed and the checks used to carry
 * their own literal, they drifted, and `check:fanout` threw on every fresh
 * clone — a verification gate that does not run is a gate that does not exist.
 * `SEED_EMAIL` overrides both together or neither.
 */
const SEED_EMAIL_FALLBACK = "dev@example.com";

export function seedEmail(): string {
  const override = process.env.SEED_EMAIL?.trim();
  return override && override.length > 0 ? override : SEED_EMAIL_FALLBACK;
}
