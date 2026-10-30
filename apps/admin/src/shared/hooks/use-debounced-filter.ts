import { useEffect, useRef, useState } from "react";

const FILTER_DEBOUNCE_MS = 300;

export function isOwnCommitEcho(committed: string, lastCommitted: string): boolean {
  return committed === lastCommitted;
}

export function useDebouncedFilter(
  committed: string,
  commit: (value: string) => void,
): [string, (value: string) => void] {
  const [draft, setDraft] = useState(committed);
  const lastCommitted = useRef(committed);
  const latestCommit = useRef(commit);
  latestCommit.current = commit;

  useEffect(() => {
    if (isOwnCommitEcho(committed, lastCommitted.current)) return;

    lastCommitted.current = committed;
    setDraft(committed);
  }, [committed]);

  useEffect(() => {
    if (draft === committed) return;

    const timer = setTimeout(() => {
      lastCommitted.current = draft;
      latestCommit.current(draft);
    }, FILTER_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [draft, committed]);

  return [draft, setDraft];
}
