(() => {
  let stored = null;

  try {
    stored = window.localStorage.getItem("theme");
  } catch {
    stored = null;
  }

  const followsSystem = stored !== "light" && stored !== "dark";
  const dark = followsSystem
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : stored === "dark";

  document.documentElement.classList.toggle("dark", dark);
})();
