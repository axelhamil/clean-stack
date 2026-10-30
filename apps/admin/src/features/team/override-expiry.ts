export function overrideExpiryOf(day: string): string | null {
  if (!day) return null;

  return new Date(`${day}T23:59:59.999`).toISOString();
}
