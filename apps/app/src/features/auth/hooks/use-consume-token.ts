import { useEffect, useRef } from "react";

/**
 * A link token is single-use: StrictMode's double effect would send it twice and
 * the second call would fail on an already-consumed token, so the latch fires once.
 */
export function useConsumeToken(token: string, consume: (token: string) => void): void {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    consume(token);
  }, [token, consume]);
}
