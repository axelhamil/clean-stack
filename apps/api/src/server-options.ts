/**
 * Pure derivation of the `Bun.serve` options from configuration.
 *
 * Bun's `idleTimeout` default is 10s and it applies *while the fetch handler runs* —
 * measured in this repo: a handler silent for 15s has its socket closed at 10s, and
 * a stream that writes once then waits 25s is closed at 10s too. Leaving it unset
 * therefore breaks every long response, sweeps and the notification SSE stream alike.
 */
export function buildServerOptions(input: { port?: number; idleTimeoutSeconds: number }): {
  port: number | undefined;
  idleTimeout: number;
} {
  return { port: input.port, idleTimeout: input.idleTimeoutSeconds };
}
