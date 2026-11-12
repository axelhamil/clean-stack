export function isBanLive(
  banned: boolean | null | undefined,
  banExpires: Date | null | undefined,
  now: Date,
): boolean {
  if (banned !== true) return false;

  return !banExpires || banExpires.getTime() > now.getTime();
}
