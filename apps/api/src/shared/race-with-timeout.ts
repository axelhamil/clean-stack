export async function raceWithTimeout<T>(
  work: Promise<T>,
  ms: number,
  onTimeout: () => T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  }).then(onTimeout);

  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
