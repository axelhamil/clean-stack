export function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString();
}
