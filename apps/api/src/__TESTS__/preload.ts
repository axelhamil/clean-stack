/**
 * Runs before every test file (`bunfig.toml` `[test] preload`), ahead of the first
 * `shared/env` import. `.env.example` leaves INTERNAL_SIGNING_KEY empty on purpose so
 * no working key ships with the repository; the HMAC tests still need one, so the
 * suite supplies a fixed key that only ever exists inside `bun test`. A key exported
 * by the shell or the CI job wins.
 */
const TEST_INTERNAL_SIGNING_KEY = "bun-test-only-internal-signing-key-0123456789";

if (!process.env.INTERNAL_SIGNING_KEY) {
  process.env.INTERNAL_SIGNING_KEY = TEST_INTERNAL_SIGNING_KEY;
}
