const REVEAL_DURATION_MS = 200;
const REVEAL_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const TRANSITIONING_CLASS = "theme-transitioning";

export async function revealThemeChange(
  origin: HTMLElement | null,
  applyTheme: () => void,
): Promise<void> {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!document.startViewTransition || reduced || !origin) {
    applyTheme();
    return;
  }

  const rect = origin.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  const root = document.documentElement;
  root.classList.add(TRANSITIONING_CLASS);

  const transition = document.startViewTransition(applyTheme);

  try {
    await transition.ready;
    root.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
      },
      {
        duration: REVEAL_DURATION_MS,
        easing: REVEAL_EASING,
        pseudoElement: "::view-transition-new(root)",
      },
    );
    await transition.finished;
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) throw err;
  } finally {
    root.classList.remove(TRANSITIONING_CLASS);
  }
}
