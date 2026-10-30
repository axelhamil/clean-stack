import { useEffect, useRef, useState } from "react";

const FILTER_DEBOUNCE_MS = 300;

export function useDebouncedFilter(
  committed: string,
  commit: (value: string) => void,
): [string, (value: string) => void] {
  const [draft, setDraft] = useState(committed);
  const latestCommit = useRef(commit);
  latestCommit.current = commit;

  useEffect(() => setDraft(committed), [committed]);

  useEffect(() => {
    if (draft === committed) return;

    const timer = setTimeout(() => latestCommit.current(draft), FILTER_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [draft, committed]);

  return [draft, setDraft];
}
